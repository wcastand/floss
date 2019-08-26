const { hydrate } = ReactDOM

const App = <div />

const app = document.getElementById('app')
hydrate(<App />, app)
