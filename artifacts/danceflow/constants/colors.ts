// Hallmark redesign: "Just Dance stage" palette. Cool lilac floor, hot pink lead,
// electric cyan and lime as the game's light rigs, deep indigo stage for dark surfaces.
// Bright fills (secondary/accent/sun) always carry `foreground` (deep ink) for contrast;
// primary/violet/stage fills carry `primaryForeground` / `stageForeground` (near-white lilac).
const colors = {
  light: {
    text: '#1A0F45',
    tint: '#FF2E93',
    background: '#EFE9FF',
    foreground: '#1A0F45',
    card: '#FBF9FF',
    cardForeground: '#1A0F45',
    primary: '#F0167F',
    primaryForeground: '#FFF7FC',
    secondary: '#2EE6FF',
    secondaryForeground: '#1A0F45',
    muted: '#DDD3FA',
    mutedForeground: '#5E5390',
    accent: '#C8FF2E',
    accentForeground: '#1A0F45',
    destructive: '#FF3D5A',
    destructiveForeground: '#FFF7FC',
    border: 'rgba(58,30,150,0.16)',
    input: '#E2D9FF',
    violet: '#7A2BFF',
    sun: '#FF9E3D',
    stage: '#1B0F52',
    stageForeground: '#FBF6FF',
    scrim: 'rgba(22,9,66,0.82)',
    clear: 'rgba(22,9,66,0)',
    glass: 'rgba(251,249,255,0.62)',
    glassFallback: 'rgba(251,249,255,0.96)',
    glow: '#7A2BFF',
    focus: '#F0167F',
    glassEdge: 'rgba(255,255,255,0.7)',
  },
  // Scoped stage palette for the template playground only (via ColorScope).
  neon: {
    text: '#F6F0FF', tint: '#FF2E93', background: '#1E0B4F', foreground: '#F6F0FF',
    card: 'rgba(28,12,74,0.72)', cardForeground: '#F6F0FF', primary: '#FF2E93', primaryForeground: '#FFF7FC',
    secondary: 'rgba(46,230,255,0.22)', secondaryForeground: '#F6F0FF', muted: 'rgba(255,255,255,0.07)',
    mutedForeground: '#B9A8EE', accent: 'rgba(255,46,147,0.55)', accentForeground: '#FFF7FC',
    destructive: '#FF3D5A', destructiveForeground: '#FFF7FC', border: 'rgba(206,180,255,0.22)',
    input: 'rgba(255,255,255,0.06)', violet: '#7A2BFF', sun: 'rgba(255,214,46,0.4)', stage: '#12063A',
    stageForeground: '#FBF6FF', scrim: 'rgba(12,4,40,0.82)', clear: 'rgba(12,4,40,0)',
    glass: 'rgba(36,16,92,0.7)', glassFallback: 'rgba(36,16,92,0.96)', glow: '#FF2E93', focus: '#2EE6FF',
    glassEdge: 'rgba(206,180,255,0.3)',
    pink: '#FF2E93', yellow: '#FFD62E', cyan: '#2EE6FF', deep: '#2A0E6E',
  },
  radius: 14,
};

export default colors;
