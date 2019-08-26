module.exports.htmlTemplate = (code, reactDom) => {
  return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>React SSR</title>
          <script crossorigin src="https://unpkg.com/react@16/umd/react.production.min.js"></script>
          <script crossorigin src="https://unpkg.com/react-dom@16/umd/react-dom.production.min.js"></script>
      </head>
      <body>
          <div id="app">${reactDom}</div>
          <script>
            const { hydrate } = ReactDOM

            const App = React.createElement(${mod}, { context: {} })
            const app = document.getElementById('app')
            hydrate(React.createElement(App, {}), app)
          </script>
      </body>
      </html>
  `
}
