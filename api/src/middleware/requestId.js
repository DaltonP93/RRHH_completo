const { randomUUID } = require('crypto');

// Agrega un UUID único a cada request HTTP.
// Lo expone en:
//   req.id           — para usar en handlers y servicios
//   res header       — X-Request-Id para el cliente
//   AsyncLocalStorage — para que el logger lo incluya sin pasarlo explícitamente
const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  requestContext.run({ requestId: id, userId: null }, next);
}

// Inyectar userId al contexto una vez autenticado
function setContextUser(userId) {
  const store = requestContext.getStore();
  if (store) store.userId = userId;
}

function getRequestId() {
  return requestContext.getStore()?.requestId || null;
}

function getContextUser() {
  return requestContext.getStore()?.userId || null;
}

module.exports = { requestId, setContextUser, getRequestId, getContextUser, requestContext };
