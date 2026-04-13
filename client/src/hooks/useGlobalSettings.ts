import { useState, useEffect } from 'react';

export function useGlobalSettings() {
  const [persona, setPersona] = useState<string>(() => {
    const saved = localStorage.getItem('navix_persona');
    return saved || "A helpful, concise travel assistant that focuses on logistics and hidden local gems. Maintains a professional yet adventurous tone.";
  });

  useEffect(() => {
    localStorage.setItem('navix_persona', persona);
  }, [persona]);

  return {
    persona,
    setPersona
  };
}
