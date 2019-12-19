const express = require('express')
const cmd = require('node-cmd')
const crypto = require('crypto')
const bodyParser = require('body-parser')
const fs = require('fs')
const cors = require('cors')
const Database = require('./db')

const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)

io.set('origins', '*:*')

io.on('connection', socket => {
  socket.emit('news', { hello: 'world' })
  socket.on('client-event', data => {
    console.log(data)
  })
})

app.use(bodyParser.json())
app.use(express.static('public'))
app.use(cors())

const db = new Database()

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
  const obj = {
    model: {
      name: req.body.model.name,
      config: req.body.model.config
    },
    optimizer: {
      name: req.body.optimizer.name,
      config: req.body.optimizer.config
    },
    training_start: Date.now(),
    training_end: null,
    history: []
  }

  const id = db.insertModel(obj)
  res.json({ id })
})

app.get('/api/model/:id', async (req, res) => {
  const model = db.getModelById(req.params.id)
  res.json(model)
})

app.get('/api/models', async (req, res) => {
  const models = db.getModels()
  res.json(models)
})

app.post('/api/training/:id/end', async (req, res) => {
  const patch = {
    training_end: Date.now()
  }
  db.patchModel(req.params.id, patch)
  res.status(200).send('OK')
})

app.post('/api/training/:id/stop', async (req, res) => {
  const patch = {
    stop_signal: true,
    training_end: Date.now()
  }
  db.patchModel(req.params.id, patch)
  res.status(200).send('OK')
})

app.get('/api/training/:id/stop', async (req, res) => {
  const stopSignal = db.getModelAttr(req.params.id, '$.stop_signal')
  res.json({ stop: Boolean(stopSignal) })
})

app.post('/api/history/:id', async (req, res) => {
  db.appendHistory(req.params.id, req.body)
  io.emit(`history-${req.params.id}`, req.body)
  res.status(200).send('OK')
})

app.get('/api/history/:id', async (req, res) => {
  const history = db.getHistoryById(req.params.id)
  res.json(history)
})

app.get('/api/ping', (req, res) => {
  return res.status(200).send(`PONG [${new Date().toUTCString()}]`)
})

server.listen(process.env.PORT || 8000, () => {
  console.log(`Your app is listening on port ${process.env.PORT || 8000}`)
})
