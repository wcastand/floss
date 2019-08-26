import React, { useState } from 'react'

export default () => {
  const [c, sC] = useState(0)
  return <div onClick={() => sC(c + 1)}>Counter click: {c}</div>
}
