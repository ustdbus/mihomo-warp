import assert from "node:assert";
import { parseVpnGateCSV } from "../src/vpngate.js";

const sampleOvpn = `
dev tun
proto udp
remote 1.2.3.4 1194
cipher AES-128-CBC
auth SHA1
<ca>
-----BEGIN CERTIFICATE-----
MIIF_TEST_CA
-----END CERTIFICATE-----
</ca>
<cert>
-----BEGIN CERTIFICATE-----
MIIF_TEST_CERT
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN RSA PRIVATE KEY-----
MIIF_TEST_KEY
-----END RSA PRIVATE KEY-----
</key>
`;

const b64 = Buffer.from(sampleOvpn).toString("base64");

const sampleCsv = `*vpn_servers
#HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64
vg-test-1,1.2.3.4,1000,15,500000000,Japan,JP,10,100,10,10,2weeks,op,msg,${b64}
vg-test-2,2.3.4.5,900,20,300000000,Korea Republic of,KR,5,100,5,5,2weeks,op,msg,${b64}
*`;

const nodes = parseVpnGateCSV(sampleCsv);
console.log("解析出的节点数:", nodes.length);
assert.strictEqual(nodes.length, 2);

const jp = nodes[0];
assert.strictEqual(jp.ip, "1.2.3.4");
assert.strictEqual(jp.countryZh, "日本");
assert.strictEqual(jp.cc, "JP");
assert.strictEqual(jp.port, 1194);
assert.strictEqual(jp.proto, "udp");
assert.strictEqual(jp.cipher, "AES-128-CBC");
assert.strictEqual(jp.auth, "SHA1");
assert.ok(jp.ca.includes("MIIF_TEST_CA"));
assert.ok(jp.cert.includes("MIIF_TEST_CERT"));
assert.ok(jp.key.includes("MIIF_TEST_KEY"));

const kr = nodes[1];
assert.strictEqual(kr.ip, "2.3.4.5");
assert.strictEqual(kr.countryZh, "韩国");

console.log("VPN Gate 解析单测全部通过！");
