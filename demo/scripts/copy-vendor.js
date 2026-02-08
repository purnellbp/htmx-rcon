const fs = require('fs');
const path = require('path');
const d = __dirname;
const root = path.join(d, '..');
const nm = (x) => path.join(root, 'node_modules', x);
const pub = (x) => path.join(root, 'public', x);
const pairs = [
  [nm('htmx.org/dist/htmx.min.js'), pub('node_modules/htmx.org/dist/htmx.min.js')],
  [nm('htmx-ext-sse/sse.js'), pub('node_modules/htmx-ext-sse/sse.js')],
];
pairs.forEach(([src, dest]) => {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  } catch (e) {}
});
