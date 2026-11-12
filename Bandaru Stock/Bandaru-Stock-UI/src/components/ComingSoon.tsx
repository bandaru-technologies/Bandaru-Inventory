interface ComingSoonProps {
  title: string
}

function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div style={{ padding: '48px', fontFamily: 'sans-serif' }}>
      <h1>{title}</h1>
      <p>This portal is coming soon.</p>
      <a href="/">Back to Home</a>
    </div>
  )
}

export default ComingSoon
