import { exists } from '@main/util/fs';
import { createFailureServerStatus } from '@universal/entities/serverStatus';
import { queryStatus } from '@xmcl/client';
import { readFile, readJSON } from 'fs-extra';
import { join } from 'path';
import Service, { Pure } from './Service';

export default class ServerStatusService extends Service {
    async load() {
        const protocolFile = this.getAppDataPath('protocol.json');
        if (await exists(protocolFile)) {
            const buf = await readFile(protocolFile);
            const object = JSON.parse(buf.toString());
            if (object.eTag) {
                // request server for new one
            }
            const mcversionMapping: any = {};
            for (const [mc, prot] of Object.entries(object.protocol)) {
                if (!mcversionMapping[mc]) mcversionMapping[mc] = [];
                mcversionMapping[mc].push(prot);
            }
            this.commit('protocolMapping', {
                protocol: object.protocol,
                mcversion: mcversionMapping,
            });
        } else {
            const rev = await readJSON(join(__static, 'protocol.json'));
            const forward = await readJSON(join(__static, 'mc-protocol.json'));

            this.commit('protocolMapping', {
                protocol: forward,
                mcversion: rev,
            });
        }
    }

    @Pure()
    async pingServer(payload: { host: string; port?: number; protocol?: number }) {
        const { host, port = 25565, protocol } = payload;
        this.log(`Ping server ${host}:${port} with protocol: ${protocol}`);
        try {
            const status = await queryStatus({ host, port }, { protocol });
            return status;
        } catch (e) {
            if (e.message === 'Connection timeout.') {
                return createFailureServerStatus('profile.server.status.timeout');
            }
            switch (e.code) {
                case 'ETIMEOUT':
                    return createFailureServerStatus('profile.server.status.timeout');
                case 'ENOTFOUND':
                    return createFailureServerStatus('profile.server.status.nohost');
                case 'ECONNREFUSED':
                    return createFailureServerStatus('profile.server.status.refuse');
                default:
                    return createFailureServerStatus('profile.server.status.ping');
            }
        }
    }

    @Pure()
    async pingServers() {
        const version = this.getters.instanceProtocolVersion;
        if (this.state.instance.serverInfos.length > 0) {
            const results = await Promise.all(this.state.instance.serverInfos.map(s => queryStatus({ host: s.ip, port: 25565 }, { protocol: version })));
            return results.map((r, i) => ({ status: r, ...this.state.instance.serverInfos[i] }));
        }
        return [];
    }
}
