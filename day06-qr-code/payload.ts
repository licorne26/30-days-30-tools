/** Build the text that goes into the QR code for each mode. Pure functions, easy to test. */

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass'

export type Wifi = { ssid: string; password: string; security: WifiSecurity; hidden: boolean }

export type Card = { name: string; phone: string; email: string; org: string; title: string; url: string }

/** Backslash-escape the characters that have a meaning in the WIFI: format. */
function wifiEscape(s: string) {
  return s.replace(/([\\;,:"])/g, '\\$1')
}

/** The de-facto standard read by the iOS and Android cameras: WIFI:T:WPA;S:name;P:pass;; */
export function wifiPayload(w: Wifi) {
  const parts = [`T:${w.security}`, `S:${wifiEscape(w.ssid)}`]
  if (w.security !== 'nopass') parts.push(`P:${wifiEscape(w.password)}`)
  if (w.hidden) parts.push('H:true')
  return `WIFI:${parts.join(';')};;`
}

/** vCard 3.0 escaping: backslash, comma, semicolon and new lines. */
function vcardEscape(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n')
}

export function vcardPayload(c: Card) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']
  const name = vcardEscape(c.name.trim())
  lines.push(`N:${name};;;;`, `FN:${name}`)
  if (c.org.trim()) lines.push(`ORG:${vcardEscape(c.org.trim())}`)
  if (c.title.trim()) lines.push(`TITLE:${vcardEscape(c.title.trim())}`)
  if (c.phone.trim()) lines.push(`TEL;TYPE=CELL:${c.phone.replace(/[^\d+]/g, '')}`)
  if (c.email.trim()) lines.push(`EMAIL:${c.email.trim()}`)
  if (c.url.trim()) lines.push(`URL:${c.url.trim()}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}
