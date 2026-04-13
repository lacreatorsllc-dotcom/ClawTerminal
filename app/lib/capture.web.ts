export async function captureViewToUri(_ref: React.RefObject<any>): Promise<string> {
  // Web: return a sentinel — caller handles via shareOrSaveUri
  return 'web-screenshot'
}

export async function shareOrSaveUri(uri: string): Promise<void> {
  if (uri === 'web-screenshot') {
    alert('Take a screenshot to save the card — swipe up + lock button on iPhone.')
  }
}
