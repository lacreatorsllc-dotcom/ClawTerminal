const GTRANSLATE = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t'

const cache = new Map<string, string>()

export async function translateToEnglish(text: string): Promise<string> {
  if (!text) return text
  if (cache.has(text)) return cache.get(text)!
  try {
    const r = await fetch(`${GTRANSLATE}&q=${encodeURIComponent(text.slice(0, 480))}`)
    const data = await r.json()
    const detectedLang: string = data?.[2] ?? 'en'
    if (detectedLang === 'en') return text
    const translated: string = (data?.[0] ?? []).map((seg: any[]) => seg[0] ?? '').join('')
    if (translated.trim()) {
      cache.set(text, translated)
      return translated
    }
  } catch {}
  return text
}
