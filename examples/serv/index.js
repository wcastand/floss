import React, { useState, useEffect } from 'react'

export default () => {
  const [c, sC] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => sC(c + 1), 1000)
    return () => clearInterval(timer)
  }, [c])
  return <div onClick={() => sC(c + 1)}>Counter: {c}</div>
}
