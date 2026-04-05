export default function Avatar({ src, color, size = 10, className = '' }) {
  const px = size * 4

  return (
    <div
      className={`rounded-full flex-shrink-0 ${className}`}
      style={{
        width: px,
        height: px,
        padding: 2,
        background: `linear-gradient(135deg, ${color}, ${color}66)`,
        boxShadow: `0 0 10px ${color}44`,
      }}
    >
      {/* image + color overlay stacked */}
      <div className="relative w-full h-full rounded-full overflow-hidden">
        <img
          src={src}
          className="w-full h-full object-cover block"
        />
        {/* terminal color tint overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: `${color}28`,
            mixBlendMode: 'color',
          }}
        />
        {/* subtle dark vignette to ground it */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.35) 100%)',
          }}
        />
      </div>
    </div>
  )
}
