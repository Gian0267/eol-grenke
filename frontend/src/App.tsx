import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ImportLista from './pages/backoffice/ImportLista'
import ListaPratiche from './pages/backoffice/ListaPratiche'
import PraticaPlaceholder from './pages/PraticaPlaceholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/backoffice/import" element={<ImportLista />} />
        <Route path="/backoffice/pratiche" element={<ListaPratiche />} />
        <Route path="/pratica/:token" element={<PraticaPlaceholder />} />
        <Route path="*" element={<Navigate to="/backoffice/pratiche" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
