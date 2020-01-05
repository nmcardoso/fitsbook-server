const sqlite = require('better-sqlite3')
const fs = require('fs')
const nanoid = require('nanoid')

class Database {
  constructor() {
    this.dbInstance = new sqlite('./.data/fitsbook.db', { verbose: x => console.info(`>> ${x}`) })
    this.DB_VERSION = 1

    if (!fs.existsSync('./.data/fitsbook.version')) {
      fs.writeFileSync('./.data/fitsbook.version', String(-1))
    }

    const storedVersion = parseInt(fs.readFileSync('./.data/fitsbook.version', 'utf8'))
    if (storedVersion < this.DB_VERSION) {
      if (this.setup(storedVersion, this.DB_VERSION)) {
        fs.writeFileSync('./.data/fitsbook.version', String(this.DB_VERSION))
      }
    }
  }

  setup(oldVersion, newVersion) {
    const db = this.dbInstance

    for (let i = oldVersion + 1; i <= newVersion; i++) {
      try {
        if (fs.existsSync(`./db_migrations/${i}.sql`)) {
          db.exec(fs.readFileSync(`./db_migrations/${i}.sql`, 'utf8'))
        }
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    }
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

  deleteModelById(id) {
    const db = this.dbInstance

    const stmt = db.prepare('DELETE FROM models WHERE oid = ?')
    const info = stmt.run(id)
    console.log('DELETE MODEL', info)
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

  insertUser(name, username, password) {
    const db = this.dbInstance

    const stmt = db.prepare('INSERT INTO users(name, username, password) VALUES(?, ?, ?);')
    const info = stmt.run(name, username, password)
    console.log('INSERT USER', info)
  }

  getUser(username) {
    const db = this.dbInstance

    const stmt = db.prepare('SELECT oid AS id, * FROM users WHERE username = ?;')
    const user = stmt.get(username)
    return user
  }

  userExists(username) {
    const db = this.dbInstance

    const stmt = db.prepare('SELECT COUNT(*) AS count FROM users WHERE username = ?;')
    const count = stmt.pluck().get(username)
    return count > 0
  }

  checkPassword(username, password) {
    const db = this.dbInstance

    const stmt = db.prepare('SELECT COUNT(*) AS count FROM users WHERE username = ? AND password = ?;')
    const count = stmt.pluck().get(username, password)
    return Boolean(count)
  }

  createAuthToken(userid) {
    const db = this.dbInstance

    const id = nanoid(48)
    const token = {
      userid: userid,
      token: id,
      created_at: Date.now(),
      valid_until: Date.now() + 1000 * 60 * 60 * 24 * 10 // 10 days
    }

    const stmt = db.prepare(`INSERT INTO jwt(document) VALUES(?);`)
    const info = stmt.run(JSON.stringify(token))
    console.log('CREATE SESSION INFO', info)
    return token
  }

  validateAuthToken(userid, token) {
    const db = this.dbInstance

    const stmt = db.prepare(`
      SELECT COUNT(DISTINCT document) AS count 
      FROM jwt, json_each(jwt.document) 
      WHERE json_extract(document, '$.token') = ? 
      AND json_extract(document, '$.userid') = ?
      AND json_extract(document, '$.valid_until') >= ?;
    `)
    const count = stmt.pluck().get(token, userid, Date.now())

    return count > 0
  }
}

module.exports = Database
