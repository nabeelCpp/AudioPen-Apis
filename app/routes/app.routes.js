
const audioPenController = require("../controllers/audioPen.controller")

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    )
    next()
  })

  app.group("/api", (router) => {
    router.post("/audio", audioPenController.index)
  })
}