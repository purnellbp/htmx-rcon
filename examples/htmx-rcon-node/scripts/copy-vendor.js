const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = (x) => path.join(root, 'node_modules', x);
const vendor = (x) => path.join(root, 'public', 'vendor', x);
const pairs = [
  [nm('htmx.org/dist/htmx.min.js'), vendor('htmx.min.js')],
  [nm('htmx-ext-sse/sse.js'), vendor('sse.js')],
];
pairs.forEach(([src, dest]) => {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  } catch (e) {}
});
