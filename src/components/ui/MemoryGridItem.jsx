/**
 * MemoryGridItem — célula da galeria (foto/vídeo/áudio).
 *
 * Componente MEMOIZADO: só re-renderiza quando muda algo dele especificamente.
 * Isso elimina o flicker das fotos quando o usuário seleciona/desseleciona
 * (antes a tela inteira re-renderizava e todas as imagens piscavam).
 */
import React from 'react'
import LazyImage from './LazyImage.jsx'

function MemoryGridItem({
  memory,
  isSelected,
  isLockSelected,
  selectMode,
  lockMode,
  resolver,    // função estável que retorna URL da imagem
  styles,
  filterIcons,
  onPointerDown,
  onClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) {
  return (
    <div
      data-memory-id={memory.id}
      className={`${styles.memThumb} ${isSelected ? styles.memThumbSelected : ''} ${isLockSelected ? styles.memThumbLocked : ''}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      role="button"
      aria-label={memory.title || 'Memória'}
    >
      {memory.type === 'photo' && (
        <LazyImage
          src={resolver}
          alt={memory.title || ''}
          className={styles.thumbImg}
          rootMargin="1500px"
          placeholder={
            <div className={styles.thumbPlaceholder}>
              <img src={filterIcons.photo} alt="" width={32} height={32} aria-hidden="true" />
            </div>
          }
        />
      )}

      {memory.type === 'video' && (
        <>
          <div className={styles.thumbPlaceholder} style={{ background: '#1a1a2e' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#D37E65" strokeWidth="1.5" width="36" height="36">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <path d="m16 10-6-4v8l6-4z" fill="#D37E65" stroke="none"/>
            </svg>
          </div>
          <div className={styles.playOverlay} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </>
      )}

      {memory.type === 'audio' && (
        <div className={styles.thumbPlaceholder}>
          <img src={filterIcons.audio} alt="" width={32} height={32} aria-hidden="true" />
          <span className={styles.thumbTitle}>{memory.title || 'Audio'}</span>
        </div>
      )}

      {memory.isHighlight && (
        <div className={styles.highlightBadge} aria-hidden="true">
          <img src={filterIcons.highlight} alt="" width={14} height={14} />
        </div>
      )}

      {selectMode && (
        <div className={`${styles.selectCircle} ${isSelected ? styles.selectCircleActive : ''}`} aria-hidden="true">
          {isSelected && (
            <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
        </div>
      )}
    </div>
  )
}

// React.memo com comparação custom — só re-renderiza se algo relevante mudou
export default React.memo(MemoryGridItem, (prev, next) => {
  return (
    prev.memory === next.memory &&
    prev.isSelected === next.isSelected &&
    prev.isLockSelected === next.isLockSelected &&
    prev.selectMode === next.selectMode &&
    prev.lockMode === next.lockMode &&
    prev.resolver === next.resolver
    // Os callbacks (onClick, etc) mudam de identidade mas isso é OK — só dispara
    // re-render se algo VISÍVEL mudou. Os callbacks são pegos do React no momento da chamada.
  )
})
