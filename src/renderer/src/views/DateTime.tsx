import { useEffect, useState } from 'react'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export default function DateTime(): React.JSX.Element {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="date-time">
      <div className="date-time-date">
        {now.getFullYear()}-{pad(now.getMonth() + 1)}-{pad(now.getDate())} 星期{WEEK[now.getDay()]}
      </div>
      <div className="date-time-clock">
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </div>
    </div>
  )
}
