#!/usr/bin/env node
'use strict'
const meow = require('meow')
const chalk = require('chalk')
const { resolve } = require('path')
const floss = require('@floss/core')

const cli = meow(
  `
	Usage
	  $ floss <input>

  Options
  --port, -p  Include a port (default: 3000)
  --output, -o  Change default output directory (default: .floss)

	Examples
	  $ foo start lambda --port 3000 --output bananas
	  $ foo build lambda
	  $ foo dev lambda
	  $ foo dev
`,
  {
    flags: {
      port: {
        type: 'string',
        default: '3000',
        alias: 'p',
      },
      output: {
        type: 'string',
        default: '.floss',
        alias: 'o',
      },
    },
  },
)
if (cli.input.length < 2) {
  switch (cli.input[0]) {
    case 'start':
      const { start } = floss(
        resolve(process.cwd(), 'lambda'),
        resolve(process.cwd(), cli.flags.output),
        cli.flags.port,
      )
      return start()
    case 'build':
      const { build } = floss(
        resolve(process.cwd(), 'lambda'),
        resolve(process.cwd(), cli.flags.output),
        cli.flags.port,
      )
      return build()
    case 'dev':
      const { dev } = floss(
        resolve(process.cwd(), 'lambda'),
        resolve(process.cwd(), cli.flags.output),
        cli.flags.port,
      )
      return dev()
    default:
      const { dev } = floss(cli.input[0], resolve(process.cwd(), cli.flags.output), cli.flags.port)
      return dev()
      break
  }
} else {
  switch (cli.input[0]) {
    case 'start':
      const { start } = floss(
        resolve(process.cwd(), cli.input[1]),
        resolve(process.cwd(), cli.flags.output),
        cli.flags.port,
      )
      return start()
    case 'build':
      const { build } = floss(
        resolve(process.cwd(), cli.input[1]),
        resolve(process.cwd(), cli.flags.output),
        cli.flags.port,
      )
      return build()
    case 'dev':
      const { dev } = floss(
        resolve(process.cwd(), cli.input[1]),
        resolve(process.cwd(), cli.flags.output),
        cli.flags.port,
      )
      return dev()
    default:
      console.log(chalk.red('Command unknown'))
      break
  }
}
