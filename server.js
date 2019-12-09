const express = require('express')
const cmd = require('node-cmd')
const crypto = require('crypto')
const bodyParser = require('body-parser')
const fs = require('fs')
const levelup = require('levelup')
const leveldown = require('leveldown')
const uniqid = require('uniqid')

const app = express()
app.set('view engine', 'ejs')

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
  res.render('pages/index')
})

app.get('/chart/:id', (req, res) => {
  res.render('pages/chart', { id: req.params.id })
})

app.get('/models', (req, res) => {
  const models = {}

  db.createReadStream()
    .on('data', data => {
      models[data.key.toString()] = JSON.parse(data.value.toString())
    })
    .on('error', e => {
      console.log('GET /model db.createReadStream Error', e)
    })
    .on('end', () => {
      res.render('pages/models', { models })
    })
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
    training_start: Date.now(),
    training_end: null,
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

app.get('/api/model/:id', async (req, res) => {
  try {
    model = await db.get(req.params.id)
    return res.json(JSON.parse(model.toString()))
  } catch(e) {
    console.log(e)
    return res.json({error: e})
  }
})

app.get('/api/models', async (req, res) => {
  try {
    keys = []
    db.createKeyStream()
      .on('data', data => {
        keys.push(data.toString())
      })
      .on('error', e => {
        console.log(e)
      })
      .on('close', () => {
        console.log('Stream Closed')
      })
      .on('end', () => {
        console.log('Sream Ended')
        res.json(keys)
      })
  } catch(e) {
    console.log(e)
  }
})

app.post('/api/training/:id/end', async (req, res) => {
  try {
    const id = req.params.id

    model = await db.get(id)
    model = JSON.parse(model.toString())

    model.training_end = Date.now()

    await db.put(id, JSON.stringify(model))
    return res.status(200).send('OK')
  } catch(e) {
    console.log(e)
    return res.json({error: JSON.stringify(e) })
  }
})

app.post('/api/history/:id', async (req, res) => {
  try {
    const id = req.params.id

    model = await db.get(id)
    model = JSON.parse(model.toString())
  
    model.history.push(req.body)
  
    await db.put(id, JSON.stringify(model))
    return res.status(200).send('OK')
  } catch(e) {
    console.log(e)
    return res.json({error: e})
  }
})

app.get('/api/history/:id', async (req, res) => {
  try {
    model = await db.get(req.params.id)
    model = JSON.parse(model.toString())
    
    return res.json(model.history)
  } catch(e) {
    console.log(e)
    return res.json({error: e})
  }
})

app.get('/api/ping', (req, res) => {
  return res.status(200).send(`PONG [${new Date().toUTCString()}]`)
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`Your app is listening on port ${process.env.PORT || 3000}`)
})
