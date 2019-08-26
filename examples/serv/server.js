const createNodeLambda = require('@floss/node-lambda')
const createReactLambda = require('@floss/react-lambda')
const server = require('@floss/server')
const fetch = require('node-fetch')

const { register } = server([], 3000)

const init = async () => {
  const [name, port] = await createReactLambda('index.js')
  const [nname, nport] = await createNodeLambda('home.js')

  register({
    name: name,
    route: '/',
    host: `http://localhost:${port}`,
    method: 'get',
  })
  register({
    name: nname,
    route: '/home',
    host: `http://localhost:${nport}`,
    method: 'get',
  })
}

init()
