import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ImportLista from './pages/backoffice/ImportLista'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/backoffice/import" element={<ImportLista />} />
        <Route path="*" element={<Navigate to="/backoffice/import" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
