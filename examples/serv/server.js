const { dev: createNodeLambda, start: startNodeLambda } = require('@floss/node-lambda')
const { dev: createReactLambda, start: startReactLambda } = require('@floss/react-lambda')
const server = require('@floss/server')
const fetch = require('node-fetch')

const init = async () => {
  const { register } = server({ dev: true, registerHanler: true, assets: 'assets' })
  const [name, method, port] = await createReactLambda('index.js')
  const [nname, nmethod, nport] = await createNodeLambda('home.js')

  register({
    name,
    route: '/',
    host: `http://localhost:${port}`,
    method,
  })
  register({
    name: nname,
    route: '/home',
    host: `http://localhost:${nport}`,
    method: nmethod,
  })
}

const start = async () => {
  const { register } = server({ dev: false, registerHanler: false, assets: 'assets' })
  const [name, method, port] = await startReactLambda('index.js')
  const [nname, nmethod, nport] = await startNodeLambda('home.js')

  register({
    name,
    route: '/',
    host: `http://localhost:${port}`,
    method,
  })
  register({
    name: nname,
    route: '/home',
    host: `http://localhost:${nport}`,
    method: nmethod,
  })
}

// init()
start()
