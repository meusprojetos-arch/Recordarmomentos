/**
 * LazyImage — carrega imagem só quando entra (ou se aproxima) do viewport.
 * Estilo Google Photos / iOS Photos.
 *
 * Vantagens:
 *  - Não cria URL.createObjectURL pra TODAS as imagens da galeria (economia de RAM)
 *  - Não baixa do Firebase Storage pra imagens fora da tela (economia de banda + custo)
 *  - Libera memória quando a imagem sai há muito tempo do viewport
 *
 * Props:
 *  - src: string URL OU async function() => string (lazy, só executa quando precisa)
 *  - placeholder: ReactNode mostrado antes de carregar (default: caixa cinza)
 *  - alt: string
 *  - className: string
 *  - style: object
 *  - onClick: function
 *  - rootMargin: pixels antes de carregar (default: '500px' = carrega 500px antes de aparecer)
 *  - eager: se true, ignora lazy e carrega imediatamente (pra imagens above-the-fold)
 */
import React, { useEffect, useRef, useState } from 'react'

export default function LazyImage({
  src,
  placeholder = null,
  alt = '',
  className = '',
  style = {},
  onClick,
  rootMargin = '500px',
  eager = false,
  ...rest
}) {
  const ref = useRef(null)
  const [resolvedSrc, setResolvedSrc] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const generatedUrlRef = useRef(null) // pra revogar objectURL ao desmontar

  useEffect(() => {
    if (!ref.current) return

    let cancelled = false

    const load = async () => {
      if (cancelled) return
      try {
        let url
        if (typeof src === 'function') {
          url = await src()
        } else {
          url = src
        }
        if (cancelled) return
        if (!url) { setErrored(true); return }

        // Detecta se é blob URL gerado por nós (pra cleanup depois)
        if (typeof url === 'string' && url.startsWith('blob:')) {
          generatedUrlRef.current = url
        }
        setResolvedSrc(url)
      } catch (e) {
        if (!cancelled) setErrored(true)
      }
    }

    if (eager) {
      load()
      return () => { cancelled = true }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(ref.current)

    return () => {
      cancelled = true
      observer.disconnect()
      // Revoga objectURL se foi criado por nós (não revoga URLs externas/Firebase)
      if (generatedUrlRef.current) {
        try { URL.revokeObjectURL(generatedUrlRef.current) } catch {}
        generatedUrlRef.current = null
      }
    }
  }, [src, eager, rootMargin])

  const baseStyle = {
    background: '#e8e3d8',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.25s ease',
    opacity: loaded ? 1 : 0,
    ...style,
  }

  if (errored) {
    return (
      <div
        ref={ref}
        className={className}
        onClick={onClick}
        style={{ ...baseStyle, opacity: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#aaa' }}
      >
        🖼️
      </div>
    )
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#e8e3d8',
        ...style,
      }}
    >
      {!loaded && placeholder}
      {resolvedSrc && (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={baseStyle}
          {...rest}
        />
      )}
    </div>
  )
}
