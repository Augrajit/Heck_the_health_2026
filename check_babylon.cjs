const b = require('./node_modules/@babylonjs/core/index.js');
const k = Object.keys(b).filter(x => x.includes('Plane'));
console.log(k.join('\n'));
