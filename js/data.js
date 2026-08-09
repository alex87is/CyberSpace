/**
 * data.js — fake network topology for CyberSpace.
 *
 * This is the "ground truth" the whole game is built from. Every device is a
 * box floating in space; every interface field is an LED on that box. Fields
 * that reference a real peer on another device are `consistent: true` and
 * get rendered as a calm green laser link. Fields whose peer doesn't really
 * exist (ghost BGP neighbor, VRF/subnet mismatch, dead OSPF adjacency, a
 * neighbor address outside its own subnet, ...) are `consistent: false` and
 * become a red sweeping laser turret the player has to find and destroy.
 *
 * This dataset is intentionally fixed/hand-authored (not randomly
 * generated) so the game is reproducible and balanced. To build your own
 * scenario, edit DEVICES below — the engine (js/entities.js, js/game.js)
 * derives all links and turrets from `consistent` + `peer` automatically.
 */

// World size in game-world pixels. The camera scrolls within this.
const WORLD = { width: 3200, height: 2200 };

// device "type" -> short badge text + accent color, used by the renderer.
const DEVICE_TYPES = {
  router: { badge: 'RTR', color: '#4fd1ff' },
  switch: { badge: 'SW', color: '#7cf5b0' },
  firewall: { badge: 'FW', color: '#ff9d4f' },
  server: { badge: 'SRV', color: '#c792ff' },
  satellite: { badge: 'SAT', color: '#ffe14f' },
  monitor: { badge: 'MON', color: '#ff6fae' },
};

const DEVICES = [
  {
    id: 'core-rtr-01',
    name: 'CORE-RTR-01',
    type: 'router',
    x: 1150,
    y: 750,
    asNumber: 65001,
    fields: [
      info('SYS', 'mgmt', '10.255.0.1'),
      iface('Gi0/0', '10.0.1.1', 30, 'DEFAULT', 'BGP', 'AS65001 neighbor 10.0.1.2', {
        device: 'core-rtr-02',
        field: 'Gi0/0',
      }),
      iface('Gi0/1', '10.0.2.1', 30, 'CUSTOMER_A', 'BGP', 'AS65001 neighbor 10.0.2.2', {
        device: 'dist-sw-01',
        field: 'Gi0/24',
      }),
      iface('Gi0/2', '10.0.11.1', 30, 'DEFAULT', 'STATIC', 'route to SRV-CACHE-01', {
        device: 'srv-cache-01',
        field: 'eth0',
      }),
    ],
  },
  {
    id: 'core-rtr-02',
    name: 'CORE-RTR-02',
    type: 'router',
    x: 2050,
    y: 750,
    asNumber: 65002,
    fields: [
      info('SYS', 'mgmt', '10.255.0.2'),
      iface('Gi0/0', '10.0.1.2', 30, 'DEFAULT', 'BGP', 'AS65002 neighbor 10.0.1.1', {
        device: 'core-rtr-01',
        field: 'Gi0/0',
      }),
      iface('Gi0/1', '10.0.3.1', 30, 'CUSTOMER_B', 'BGP', 'AS65002 neighbor 10.0.3.2', {
        device: 'dist-sw-02',
        field: 'Gi0/24',
      }),
      iface('Gi0/2', '10.0.12.1', 30, 'DEFAULT', 'STATIC', 'route to SRV-WEB-02', {
        device: 'srv-web-02',
        field: 'eth0',
      }),
    ],
  },
  {
    id: 'dist-sw-01',
    name: 'DIST-SW-01',
    type: 'switch',
    x: 700,
    y: 1150,
    fields: [
      info('SYS', 'mgmt', '10.255.0.11'),
      iface('Gi0/24', '10.0.2.2', 30, 'CUSTOMER_A', 'BGP', 'AS65001 neighbor 10.0.2.1', {
        device: 'core-rtr-01',
        field: 'Gi0/1',
      }),
      iface('Gi0/1', '10.0.4.1', 30, 'DMZ', 'STATIC', 'route to EDGE-FW-01', {
        device: 'edge-fw-01',
        field: 'Gi0/0',
      }),
      brokenIface(
        'Gi0/2',
        '10.0.2.17',
        29,
        'CUSTOMER_A',
        'BGP',
        'AS65001 neighbor 10.0.2.18',
        'VRF/subnet mismatch — 10.0.2.18 does not exist in VRF CUSTOMER_A on any known peer'
      ),
      iface('Gi0/3', '10.0.13.1', 30, 'DEFAULT', 'STATIC', 'route to SRV-LOG-03', {
        device: 'srv-log-03',
        field: 'eth0',
      }),
    ],
  },
  {
    id: 'dist-sw-02',
    name: 'DIST-SW-02',
    type: 'switch',
    x: 2550,
    y: 1150,
    fields: [
      info('SYS', 'mgmt', '10.255.0.12'),
      iface('Gi0/24', '10.0.3.2', 30, 'CUSTOMER_B', 'BGP', 'AS65002 neighbor 10.0.3.1', {
        device: 'core-rtr-02',
        field: 'Gi0/1',
      }),
      iface('Gi0/2', '10.0.6.1', 30, 'CUSTOMER_B', 'STATIC', 'route to SRV-DB-02', {
        device: 'srv-db-02',
        field: 'eth0',
      }),
      iface('Gi0/3', '10.0.14.1', 30, 'DEFAULT', 'STATIC', 'route to SRV-MAIL-04', {
        device: 'srv-mail-04',
        field: 'eth0',
      }),
    ],
  },
  {
    id: 'edge-fw-01',
    name: 'EDGE-FW-01',
    type: 'firewall',
    x: 700,
    y: 1600,
    fields: [
      info('SYS', 'mgmt', '10.255.0.21'),
      iface('Gi0/0', '10.0.4.2', 30, 'DMZ', 'STATIC', 'route to DIST-SW-01', {
        device: 'dist-sw-01',
        field: 'Gi0/1',
      }),
      iface('Gi0/1', '10.0.5.1', 30, 'DMZ', 'STATIC', 'route to SRV-APP-01', {
        device: 'srv-app-01',
        field: 'eth0',
      }),
      brokenIface(
        'Gi0/2',
        '10.0.10.1',
        30,
        'DMZ',
        'BGP',
        'AS65020 neighbor 10.0.10.5',
        'bad neighbor address — 10.0.10.5 is outside subnet 10.0.10.0/30'
      ),
      iface('Gi0/3', '10.0.15.1', 30, 'DMZ', 'STATIC', 'route to SRV-AUTH-05', {
        device: 'srv-auth-05',
        field: 'eth0',
      }),
    ],
  },
  {
    id: 'srv-app-01',
    name: 'SRV-APP-01',
    type: 'server',
    x: 700,
    y: 2000,
    fields: [
      info('SYS', 'mgmt', '10.255.0.31'),
      iface('eth0', '10.0.5.2', 30, 'DMZ', 'STATIC', 'route to EDGE-FW-01', {
        device: 'edge-fw-01',
        field: 'Gi0/1',
      }),
    ],
  },
  {
    id: 'srv-db-02',
    name: 'SRV-DB-02',
    type: 'server',
    x: 2550,
    y: 1550,
    fields: [
      info('SYS', 'mgmt', '10.255.0.32'),
      iface('eth0', '10.0.6.2', 30, 'CUSTOMER_B', 'STATIC', 'route to DIST-SW-02', {
        device: 'dist-sw-02',
        field: 'Gi0/2',
      }),
    ],
  },
  {
    id: 'edge-rtr-03',
    name: 'EDGE-RTR-03',
    type: 'router',
    x: 1550,
    y: 300,
    asNumber: 65010,
    fields: [
      info('SYS', 'mgmt', '10.255.0.13'),
      brokenIface(
        'Gi0/0',
        '10.0.7.1',
        30,
        'DEFAULT',
        'BGP',
        'AS65010 neighbor 10.0.7.2',
        'ghost peer — 10.0.7.2 is not configured on any device'
      ),
    ],
  },
  {
    id: 'sat-uplink-01',
    name: 'SAT-UPLINK-01',
    type: 'satellite',
    x: 2950,
    y: 400,
    asNumber: 65099,
    fields: [
      info('SYS', 'mgmt', '10.255.0.41'),
      brokenIface(
        'Gi0/0',
        '10.0.8.1',
        29,
        'DEFAULT',
        'BGP',
        'AS65099 neighbor 10.0.8.6',
        'ghost peer — uplink neighbor 10.0.8.6 never answers'
      ),
    ],
  },
  {
    id: 'mon-node-01',
    name: 'MON-NODE-01',
    type: 'monitor',
    x: 300,
    y: 650,
    fields: [
      info('SYS', 'mgmt', '10.255.0.51'),
      brokenIface(
        'eth1',
        '10.0.9.1',
        30,
        'DEFAULT',
        'OSPF',
        'area 0.0.0.9',
        'OSPF down — no neighbor ever forms in area 0.0.0.9'
      ),
      iface('eth0', '10.0.16.1', 30, 'DEFAULT', 'STATIC', 'route to SRV-METRICS-06', {
        device: 'srv-metrics-06',
        field: 'eth0',
      }),
    ],
  },
  {
    id: 'srv-cache-01',
    name: 'SRV-CACHE-01',
    type: 'server',
    x: 1350,
    y: 950,
    fields: [
      info('SYS', 'mgmt', '10.255.0.33'),
      iface('eth0', '10.0.11.2', 30, 'DEFAULT', 'STATIC', 'route to CORE-RTR-01', {
        device: 'core-rtr-01',
        field: 'Gi0/2',
      }),
    ],
  },
  {
    id: 'srv-web-02',
    name: 'SRV-WEB-02',
    type: 'server',
    x: 2300,
    y: 1000,
    fields: [
      info('SYS', 'mgmt', '10.255.0.34'),
      iface('eth0', '10.0.12.2', 30, 'DEFAULT', 'STATIC', 'route to CORE-RTR-02', {
        device: 'core-rtr-02',
        field: 'Gi0/2',
      }),
    ],
  },
  {
    id: 'srv-log-03',
    name: 'SRV-LOG-03',
    type: 'server',
    x: 450,
    y: 1400,
    fields: [
      info('SYS', 'mgmt', '10.255.0.35'),
      iface('eth0', '10.0.13.2', 30, 'DEFAULT', 'STATIC', 'route to DIST-SW-01', {
        device: 'dist-sw-01',
        field: 'Gi0/3',
      }),
    ],
  },
  {
    id: 'srv-mail-04',
    name: 'SRV-MAIL-04',
    type: 'server',
    x: 2750,
    y: 1350,
    fields: [
      info('SYS', 'mgmt', '10.255.0.36'),
      iface('eth0', '10.0.14.2', 30, 'DEFAULT', 'STATIC', 'route to DIST-SW-02', {
        device: 'dist-sw-02',
        field: 'Gi0/3',
      }),
    ],
  },
  {
    id: 'srv-auth-05',
    name: 'SRV-AUTH-05',
    type: 'server',
    x: 950,
    y: 1800,
    fields: [
      info('SYS', 'mgmt', '10.255.0.37'),
      iface('eth0', '10.0.15.2', 30, 'DMZ', 'STATIC', 'route to EDGE-FW-01', {
        device: 'edge-fw-01',
        field: 'Gi0/3',
      }),
    ],
  },
  {
    id: 'srv-metrics-06',
    name: 'SRV-METRICS-06',
    type: 'server',
    x: 150,
    y: 900,
    fields: [
      info('SYS', 'mgmt', '10.255.0.38'),
      iface('eth0', '10.0.16.2', 30, 'DEFAULT', 'STATIC', 'route to MON-NODE-01', {
        device: 'mon-node-01',
        field: 'eth0',
      }),
    ],
  },
];

// ---- field constructors -------------------------------------------------

function info(id, label, value) {
  return { id, type: 'info', label, value };
}

function iface(id, ip, mask, vrf, proto, detail, peer) {
  return {
    id,
    type: 'iface',
    ip,
    mask,
    vrf,
    proto,
    detail,
    status: 'up',
    consistent: true,
    peer,
    issue: null,
  };
}

function brokenIface(id, ip, mask, vrf, proto, detail, issue) {
  return {
    id,
    type: 'iface',
    ip,
    mask,
    vrf,
    proto,
    detail,
    status: 'up',
    consistent: false,
    peer: null,
    issue,
  };
}
