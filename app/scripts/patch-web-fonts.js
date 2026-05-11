#!/usr/bin/env node
// Injects icon font @font-face declarations into dist/index.html after expo export.
// Run automatically via "web:build" script in package.json.
const fs = require('fs')
const path = require('path')

const htmlPath = path.join(__dirname, '../dist/index.html')
let html = fs.readFileSync(htmlPath, 'utf8')

html = html.replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/png" href="/favicon.png" />')

if (html.includes('Ionicons')) {
  fs.writeFileSync(htmlPath, html)
  console.log('[patch-web-fonts] favicon patched; fonts already injected, skipping')
  process.exit(0)
}

// Find the actual font filenames in dist/assets
const fontsDir = path.join(
  __dirname,
  '../dist/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts'
)

function findFont(prefix) {
  const files = fs.readdirSync(fontsDir)
  const match = files.find(f => f.startsWith(prefix + '.') && f.endsWith('.ttf'))
  if (!match) throw new Error(`Font not found: ${prefix}`)
  return `/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/${match}`
}

const ioniconsUrl = findFont('Ionicons')
const mciUrl = findFont('MaterialCommunityIcons')

const style = `
  <style>
    @font-face {
      font-family: 'Ionicons';
      src: url('${ioniconsUrl}') format('truetype');
      font-display: block;
    }
    @font-face {
      font-family: 'MaterialCommunityIcons';
      src: url('${mciUrl}') format('truetype');
      font-display: block;
    }
  </style>
</head>`

html = html.replace('</head>', style)
fs.writeFileSync(htmlPath, html)
console.log('[patch-web-fonts] injected font-face CSS into dist/index.html')
