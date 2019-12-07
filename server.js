const express = require('express')
const cmd = require('node-cmd')
const crypto = require('crypto')
const bodyParser = require('body-parser')
const fs = require('fs')
const levelup = require('levelup')
const leveldown = require('leveldown')
const uniqid = require('uniqid')

const app = express()
app.use(bodyParser.json())
app.use(express.static('public'))

const db = levelup(leveldown('./.data/model_db'))

const verifySignature = (req, res, next) => {
  const payload = JSON.stringify(req.body)
  const hmac = crypto.createHmac('sha1', process.env.GITHUB_SECRET)
  const digest = 'sha1=' + hmac.update(payload).digest('hex')
  const checksum = req.headers['x-hub-signature']

  if (!checksum || !digest || checksum !== digest) {
    return res.status(403).send('auth failed')
  }

  return next()
}

// Github webhook listener
app.post('/git', verifySignature, (req, res) => {
  if (req.headers['x-github-event'] == 'push') {
    cmd.get('bash git.sh', (err, data) => {
      if (err) return console.log(err)
      console.log(data)
      cmd.run('refresh')
      return res.status(200).send(data)
    })
  } else if (req.headers['x-github-event'] == 'ping') {
    return res.status(200).send('PONG')
  } else {
    return res.status(200).send('Unsuported Github event. Nothing done.')
  }
})

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
})

app.post('/test', (req, res) => {
  fs.appendFileSync('.data/test.txt', JSON.stringify(req.body) + '\n------\n')
  res.status(200).send('OK')
})

app.post('/api/model', async (req, res) => {
  const id = uniqid()
  obj = {
    model: {
      name: req.body.model.name,
      config: req.body.model.config
    },
    optimizer: {
      name: req.body.optimizer.name,
      config: req.body.optimizer.config
    },
    history: []
  }

  try {
    await db.put(id, JSON.stringify(obj))
    return res.json({id})
  } catch(e) {
    console.log(e)
    return res.json({error: e})
  }
})
})
