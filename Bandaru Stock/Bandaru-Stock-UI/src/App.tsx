import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import MerchantDirectory from './components/MerchantDirectory'
import ComingSoon from './components/ComingSoon'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/merchant/directory" element={<MerchantDirectory />} />
        <Route path="/admin/login" element={<ComingSoon title="Admin Portal" />} />
        <Route path="/customer/login" element={<ComingSoon title="Customer Portal" />} />
        <Route path="*" element={<ComingSoon title="Page Not Found" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
