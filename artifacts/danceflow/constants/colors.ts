// Hallmark redesign: "Just Dance stage" palette. Cool lilac floor, hot pink lead,
// electric cyan and lime as the game's light rigs, deep indigo stage for dark surfaces.
// Bright fills (secondary/accent/sun) always carry `foreground` (deep ink) for contrast;
// primary/violet/stage fills carry `primaryForeground` / `stageForeground` (near-white lilac).
const colors = {
  light: {
    text: '#1A0F45',
    tint: '#FF2E93',
    background: '#fbf9fd',
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
    sun: '#FED93C',
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
  // Scoped light palette for the template playground only (via ColorScope).
  neon: {
    text: '#21134D', tint: '#D92C9B', background: '#fbf9fd', foreground: '#21134D',
    card: '#FFFEFF', cardForeground: '#21134D', primary: '#7027D9', primaryForeground: '#FFFCFF',
    secondary: '#E8DFFF', secondaryForeground: '#21134D', muted: '#F0EBF9',
    mutedForeground: '#71658E', accent: '#FBE3F1', accentForeground: '#21134D',
    destructive: '#C83D5B', destructiveForeground: '#FFFCFF', border: 'rgba(71,45,123,0.15)',
    input: '#F8F5FC', violet: '#7027D9', sun: '#FED93C', stage: '#F0EBFA',
    stageForeground: '#21134D', scrim: 'rgba(30,17,66,0.78)', clear: 'rgba(30,17,66,0)',
    glass: 'rgba(255,254,255,0.82)', glassFallback: 'rgba(255,254,255,0.97)', glow: '#AE75E8', focus: '#7027D9',
    glassEdge: 'rgba(255,255,255,0.9)',
    pink: '#D92C9B', yellow: '#FED93C', cyan: '#8B6AE6', deep: '#21134D',
  },
  radius: 14,
};

export default colors;
