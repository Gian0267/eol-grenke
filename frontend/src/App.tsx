import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import ImportLista from './pages/backoffice/ImportLista'
import ListaPratiche from './pages/backoffice/ListaPratiche'
import RiacquistiInAttesa from './pages/backoffice/RiacquistiInAttesa'
import Login from './pages/backoffice/Login'
import MieiTask from './pages/backoffice/MieiTask'
import TaskEscalation from './pages/backoffice/TaskEscalation'
import AreaPratica from './pages/cliente/AreaPratica'
import PraticaScaduta from './pages/cliente/PraticaScaduta'
import OpzionePlaceholder from './pages/cliente/OpzionePlaceholder'
import FlussoRestituzione from './pages/cliente/FlussoRestituzione'
import FlussoRiacquisto from './pages/cliente/FlussoRiacquisto'
import FlussoRinnovo from './pages/cliente/FlussoRinnovo'
import FlussoContatto from './pages/cliente/FlussoContatto'
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
        <Route path="/backoffice/login" element={<Login />} />
        <Route path="/backoffice/miei-task" element={<MieiTask />} />
        <Route path="/backoffice/import" element={<ImportLista />} />
        <Route path="/backoffice/pratiche" element={<ListaPratiche />} />
        <Route path="/backoffice/riacquisti-in-attesa" element={<RiacquistiInAttesa />} />
        <Route path="/backoffice/task-escalation" element={<TaskEscalation />} />
        <Route path="/pratica/scaduta" element={<PraticaScaduta />} />
        <Route path="/pratica/:token" element={<ClienteLayout />}>
          <Route index element={<AreaPratica />} />
          <Route path="restituzione" element={<FlussoRestituzione />} />
          <Route path="riacquisto" element={<FlussoRiacquisto />} />
          <Route path="rinnovo" element={<FlussoRinnovo />} />
          <Route path="contatto" element={<FlussoContatto />} />
          <Route path=":opzione" element={<OpzionePlaceholder />} />
        </Route>
        <Route path="*" element={<Navigate to="/backoffice/pratiche" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
