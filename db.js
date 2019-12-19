const sqlite = require('better-sqlite3')
const fs = require('fs')

class Database {
  constructor() {
    this.dbInstance = new sqlite('./.data/fitsbook.db', { verbose: x => console.info(`>> ${x}`) })
    if (!fs.existsSync('./.data/fitsbook.lock')) {
      this.setup()
      fs.writeFileSync('./.data/fitsbook.lock', '')
    }
  }

  setup() {
    const db = this.dbInstance

    let stmt = db.prepare('CREATE TABLE IF NOT EXISTS models(model TEXT);')
    stmt.run()
  }

  insertModel(model) {
    const db = this.dbInstance

    const stmt = db.prepare('INSERT INTO models(model) VALUES(?);')
    const info = stmt.run(JSON.stringify(model))
    const id = info.lastInsertRowid

    this.patchModel(id, { id })
    return id
  }

  getModelById(id) {
    const db = this.dbInstance

    const stmt = db.prepare('SELECT model FROM models WHERE oid = ?;')
    return JSON.parse(stmt.pluck().get(id))
  }

  getModels(limit = 0, offset = 0) {
    const db = this.dbInstance

    let query = 'SELECT model FROM models ORDER BY oid DESC'
    query += limit ? ` LIMIT ${limit}` : ''
    query += limit && offset ? ` OFFSET ${offset}` : ''
    query += ';'

    const stmt = db.prepare(query)
    const models = stmt.pluck().all()
    return models.map(model => JSON.parse(model))
  }

  getModelAttr(id, path) {
    const db = this.dbInstance

    const stmt = db.prepare('SELECT json_extract(model, ?) FROM models WHERE oid = ?')
    const attr = stmt.pluck().get(path, id)
    return JSON.parse(attr)
  }

  getHistoryById(id) {
    const db = this.dbInstance

    const stmt = db.prepare("SELECT json_extract(model, '$.history') FROM models WHERE oid = ?")
    const history = stmt.pluck().get(id)
    return JSON.parse(history)
  }

  appendHistory(id, element) {
    const db = this.dbInstance

    let stmt = db.prepare('SELECT model FROM models WHERE oid = ?')
    const model = JSON.parse(stmt.pluck().get(id))
    model.history.push(element)

    stmt = db.prepare('UPDATE models SET model = ? WHERE oid = ?')
    const info = stmt.run(JSON.stringify(model), id)
    console.log('UPDATE INFO', info)
  }

  patchModel(id, patch) {
    const db = this.dbInstance

    const stmt = db.prepare('UPDATE models SET model = json_patch(model, ?) WHERE oid = ?')
    const info = stmt.run(JSON.stringify(patch), id)
    console.log('PATCH INFO', info)
  }
}

module.exports = Database

// const db = new Database()
// const models = db.getHistoryById(18)
// console.log(models)
// db.insertHistory(18, { epoch: 2, metrics: { acc: 4 } })
// const models2 = db.getHistoryById(18)
// console.log(models2)
// console.log(db.getModelAttr(18, '$.stop_signal'))