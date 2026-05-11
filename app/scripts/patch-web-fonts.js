#!/usr/bin/env node
// Injects icon font @font-face declarations into dist/index.html after expo export.
// Run automatically via "web:build" script in package.json.
const fs = require('fs')
const path = require('path')

// Overwrite Expo's white-background favicon.ico with our dark PNG wrapped in ICO container
;(function patchFavicon() {
  const pngPath = path.join(__dirname, '../dist/favicon.png')
  const icoPath = path.join(__dirname, '../dist/favicon.ico')
  const png = fs.readFileSync(pngPath)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const dir = Buffer.alloc(16)
  dir.writeUInt8(64, 0)
  dir.writeUInt8(64, 1)
  dir.writeUInt8(0, 2)
  dir.writeUInt8(0, 3)
  dir.writeUInt16LE(1, 4)
  dir.writeUInt16LE(32, 6)
  dir.writeUInt32LE(png.length, 8)
  dir.writeUInt32LE(22, 12)
  fs.writeFileSync(icoPath, Buffer.concat([header, dir, png]))
  console.log('[patch-web-fonts] favicon.ico overwritten with dark background')
})()

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
