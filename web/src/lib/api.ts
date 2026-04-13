import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const ANALYTICS_URL = process.env.NEXT_PUBLIC_ANALYTICS_URL || 'http://localhost:5000'

export const api = axios.create({ baseURL: API_URL })
export const analyticsApi = axios.create({ baseURL: ANALYTICS_URL })

// Interceptor: agregar token JWT automáticamente
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor: refrescar token si expira
api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken })
          localStorage.setItem('access_token', data.accessToken)
          localStorage.setItem('refresh_token', data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/auth/login', { username, password }).then(r => r.data),
  me: () => api.get('/api/auth/me').then(r => r.data),
  logout: (refreshToken: string) =>
    api.post('/api/auth/logout', { refreshToken }),
}

// ─── Empleados ────────────────────────────────────────────────────
export const employeesApi = {
  list: (params?: object) => api.get('/api/employees', { params }).then(r => r.data),
  get: (id: number)       => api.get(`/api/employees/${id}`).then(r => r.data),
  create: (data: object)  => api.post('/api/employees', data).then(r => r.data),
  update: (id: number, data: object) => api.put(`/api/employees/${id}`, data).then(r => r.data),
  history: (id: number, params?: object) =>
    api.get(`/api/employees/${id}/attendance`, { params }).then(r => r.data),
}

// ─── Asistencia ───────────────────────────────────────────────────
export const attendanceApi = {
  live: ()              => api.get('/api/attendance/live').then(r => r.data),
  byDate: (params: object) => api.get('/api/attendance', { params }).then(r => r.data),
  registerManual: (data: object) => api.post('/api/attendance/manual', data).then(r => r.data),
}

// ─── Reportes (Analytics Service) ────────────────────────────────
export const reportsApi = {
  monthly: (year: number, month: number, deptId?: number) =>
    analyticsApi.get('/reports/monthly', {
      params: { year, month, dept_id: deptId, api_key: 'analytics_secret_key' }
    }).then(r => r.data),
  daily: (date?: string, deptId?: number) =>
    analyticsApi.get('/reports/daily', {
      params: { report_date: date, dept_id: deptId, api_key: 'analytics_secret_key' }
    }).then(r => r.data),
  kpis: () =>
    analyticsApi.get('/reports/dashboard-kpis', {
      params: { api_key: 'analytics_secret_key' }
    }).then(r => r.data),
  exportExcel: (type: string, year: number, month: number) => {
    const url = `${ANALYTICS_URL}/reports/export/excel?report_type=${type}&year=${year}&month=${month}&api_key=analytics_secret_key`
    window.open(url, '_blank')
  }
}
