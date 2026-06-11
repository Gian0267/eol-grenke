import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import BackofficeLayout from './components/BackofficeLayout'
import Login from './pages/backoffice/Login'
import Dashboard from './pages/backoffice/Dashboard'
import ListaPratiche from './pages/backoffice/ListaPratiche'
import PraticaDettaglio from './pages/backoffice/PraticaDettaglio'
import MieiTask from './pages/backoffice/MieiTask'
import TaskEscalation from './pages/backoffice/TaskEscalation'
import RiacquistiInAttesa from './pages/backoffice/RiacquistiInAttesa'
import ImportLista from './pages/backoffice/ImportLista'
import ImportContrattiNSM from './pages/backoffice/ImportContrattiNSM'
import GestioneOutlier from './pages/backoffice/GestioneOutlier'
import Reportistica from './pages/backoffice/Reportistica'
import EsportaListaGrenke from './pages/backoffice/EsportaListaGrenke'
import Impostazioni from './pages/backoffice/Impostazioni'
import GestioneUtenti from './pages/backoffice/GestioneUtenti'
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
        <Route path="/backoffice" element={<BackofficeLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pratiche" element={<ListaPratiche />} />
          <Route path="pratiche/:id" element={<PraticaDettaglio />} />
          <Route path="miei-task" element={<MieiTask />} />
          <Route path="task-escalation" element={<TaskEscalation />} />
          <Route path="riacquisti-in-attesa" element={<RiacquistiInAttesa />} />
          <Route path="import" element={<ImportLista />} />
          <Route path="import-nsm" element={<ImportContrattiNSM />} />
          <Route path="outlier" element={<GestioneOutlier />} />
          <Route path="reportistica" element={<Reportistica />} />
          <Route path="export-grenke" element={<EsportaListaGrenke />} />
          <Route path="impostazioni" element={<Impostazioni />} />
          <Route path="utenti" element={<GestioneUtenti />} />
        </Route>
        <Route path="/pratica/scaduta" element={<PraticaScaduta />} />
        <Route path="/pratica/:token" element={<ClienteLayout />}>
          <Route index element={<AreaPratica />} />
          <Route path="restituzione" element={<FlussoRestituzione />} />
          <Route path="riacquisto" element={<FlussoRiacquisto />} />
          <Route path="rinnovo" element={<FlussoRinnovo />} />
          <Route path="contatto" element={<FlussoContatto />} />
          <Route path=":opzione" element={<OpzionePlaceholder />} />
        </Route>
        <Route path="*" element={<Navigate to="/backoffice/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
