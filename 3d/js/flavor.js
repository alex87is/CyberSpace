/**
 * flavor.js — cosmetic filler content for the 3D scene's readouts: fake
 * hostnames, shell command lines, and varied IP addresses that get spread
 * across tower panels and data-cube log feeds. Purely decorative — none
 * of it is read by game logic (win/lose still comes entirely from
 * js/data.js's `consistent`/`peer` fields).
 *
 * CYBER_HOSTNAMES takes its style from real cybersecurity vendor names
 * (CyberArk, Cyderes, Cyren) found via web search, extended with plausible
 * siblings in the same "Cyber+noun" pattern used across the industry.
 *
 * BASH_COMMANDS is the top-10 Linux/bash commands per a web search of
 * real-world usage data (git, cd, ls, grep, pwd, cat, mkdir, cp, mv, vim),
 * each given a realistic invocation with parameters.
 */

const CYBER_HOSTNAMES = [
  'cyberark-relay',
  'cyderes-node',
  'cyren-gateway',
  'cyberguard-01',
  'cybersentry-02',
  'cybervault-03',
  'cybernexus-04',
  'cyberforge-05',
  'cyberhawk-06',
  'cybershield-07',
  'cyberwatch-08',
  'cybergrid-09',
  'cyberwarden-10',
  'cybercipher-11',
  'cyberdrift-12',
  'cyberbeacon-13',
];

// top-10 real-world bash commands (by usage frequency), each with a
// realistic parameterized invocation.
const BASH_COMMANDS = [
  'git log --oneline -5',
  'git pull origin main',
  'cd /var/log/nginx',
  'ls -la /etc/network/interfaces.d',
  'grep -r "ERROR" /var/log/syslog',
  'pwd',
  'cat /proc/net/dev',
  'mkdir -p /opt/backups/2026-08-08',
  'cp -r /etc/nginx /etc/nginx.bak',
  'mv access.log access.log.1',
  'vim /etc/hosts',
];

function randHostname(rand) {
  return CYBER_HOSTNAMES[(rand() * CYBER_HOSTNAMES.length) | 0];
}

function randCommand(rand) {
  return BASH_COMMANDS[(rand() * BASH_COMMANDS.length) | 0];
}

// A private-range IP (10.x, 172.16-31.x, or 192.168.x), spanning the three
// RFC1918 blocks instead of always the same 10.x pattern.
function randPrivateIp(rand) {
  const kind = rand();
  if (kind < 0.5) return `10.${(rand() * 255) | 0}.${(rand() * 255) | 0}.${(rand() * 255) | 0}`;
  if (kind < 0.8) return `172.${16 + ((rand() * 16) | 0)}.${(rand() * 255) | 0}.${(rand() * 255) | 0}`;
  return `192.168.${(rand() * 255) | 0}.${(rand() * 255) | 0}`;
}

// A "public-looking" IP from the RFC5737 documentation ranges — safe fake
// addresses that will never resolve to a real host, for log-line variety.
function randDocIp(rand) {
  const nets = ['192.0.2', '198.51.100', '203.0.113'];
  const net = nets[(rand() * nets.length) | 0];
  return `${net}.${(rand() * 255) | 0}`;
}

// A varied IP, sometimes from a documentation range, sometimes with a
// /mask suffix and sometimes bare — so readouts show a real mix instead of
// one repeated pattern.
function randIpMaybeMasked(rand, maskChance = 0.5) {
  const ip = rand() < 0.15 ? randDocIp(rand) : randPrivateIp(rand);
  if (rand() < maskChance) {
    const masks = [8, 16, 24, 25, 26, 27, 28, 29, 30];
    return `${ip}/${masks[(rand() * masks.length) | 0]}`;
  }
  return ip;
}
