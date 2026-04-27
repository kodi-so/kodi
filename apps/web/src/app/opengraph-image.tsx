import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Kodi — AI teammate for meetings and follow-through'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          width: '100%',
          height: '100%',
          padding: '72px 80px',
          background: 'linear-gradient(160deg, #F6F4EE 0%, #EDE8DF 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '400px',
            background:
              'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(223,174,86,0.28) 0%, transparent 70%)',
          }}
        />

        {/* Logo mark placeholder */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#3E5056',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F6F4EE',
              fontSize: '20px',
              fontWeight: 600,
            }}
          >
            K
          </div>
          <span style={{ fontSize: '24px', color: '#3E5056', letterSpacing: '-0.02em' }}>
            Kodi
          </span>
        </div>

        <div
          style={{
            fontSize: '64px',
            lineHeight: '0.95',
            letterSpacing: '-0.055em',
            color: '#1A252A',
            marginBottom: '24px',
            maxWidth: '900px',
          }}
        >
          The meeting ends.
          <br />
          The work begins.
        </div>

        <div
          style={{
            fontSize: '22px',
            color: '#5C6E77',
            lineHeight: '1.5',
            maxWidth: '680px',
          }}
        >
          Kodi joins meetings, answers with live business context,
          and moves follow-through forward across your existing tools.
        </div>
      </div>
    ),
    { ...size }
  )
}
