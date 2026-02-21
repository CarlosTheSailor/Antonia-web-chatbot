window.AntoniaChatbotConfig = {
  title: 'Pregúntale a Antonia',
  apiBase: 'http://localhost:3000',
  colors: {
    accent: '#d8232a',
    background: '#0b0b0b',
    surface: '#161616',
    text: '#f7f7f7',
    mutedText: '#bbbbbb',
    border: '#2a2a2a'
  },
  fonts: {
    heading: "'Bebas Neue', 'Arial Narrow', sans-serif",
    body: "'Montserrat', Arial, sans-serif",
    googleFontUrl:
      'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;700&display=swap'
  },
  launcher: {
    imageUrl: '/assets/antonia-face.png',
    fallbackEmoji: '🐶',
    size: 66,
    borderColor: '#d8232a'
  },
  labels: {
    inputPlaceholder: 'Pregunta aquí lo que necesites',
    sendButton: 'Enviar',
    welcomeMessage:
      'Ey, soy Antonia 🐶\nTe ayudo con precios, horarios, tipos de clase (Cross, Funcional, Strong, Mobilitat...) y te digo cuál te encaja mejor según tu nivel.\nSi quieres, también te dejo cerrada la clase gratis de bienvenida (solo para venir a probar por primera vez).\n¿Qué necesitas hoy?',
    leadTitle: 'Te dejo la plaza preparada',
    leadCta: 'Dejar contacto'
  },
  debug: {
    showReset: true
  }
};
