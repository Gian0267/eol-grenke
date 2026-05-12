import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import ImportLista from './pages/backoffice/ImportLista'
import ListaPratiche from './pages/backoffice/ListaPratiche'
import AreaPratica from './pages/cliente/AreaPratica'
import PraticaScaduta from './pages/cliente/PraticaScaduta'
import OpzionePlaceholder from './pages/cliente/OpzionePlaceholder'
import WidgetChiamami from './components/WidgetChiamami'

function ClienteLayout() {
  const { token } = useParams<{ token: string }>()
  return (
    <>
      <Outlet />
      {token && <WidgetChiamami token={token} />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/backoffice/import" element={<ImportLista />} />
        <Route path="/backoffice/pratiche" element={<ListaPratiche />} />
        <Route path="/pratica/scaduta" element={<PraticaScaduta />} />
        <Route path="/pratica/:token" element={<ClienteLayout />}>
          <Route index element={<AreaPratica />} />
          <Route path=":opzione" element={<OpzionePlaceholder />} />
        </Route>
        <Route path="*" element={<Navigate to="/backoffice/pratiche" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
