import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import SocialProof from './components/SocialProof.jsx'
import ProductPreview from './components/ProductPreview.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import Features from './components/Features.jsx'
import Showcase from './components/Showcase.jsx'
import EarlyAccess from './components/EarlyAccess.jsx'
import Footer from './components/Footer.jsx'
import ProfilePage from './components/ProfilePage.jsx'

function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <main>
        <Hero />
        <SocialProof />
        <ProductPreview />
        <HowItWorks />
        <Features />
        <Showcase />
        <EarlyAccess />
      </main>
      <Footer />
    </div>
  )
}

function Profile() {
  const { username } = useParams()
  return <ProfilePage username={username} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/:username" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  )
}
