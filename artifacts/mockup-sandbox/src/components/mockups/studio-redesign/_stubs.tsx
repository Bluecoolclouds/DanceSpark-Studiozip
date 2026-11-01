// Static data in isolated previews only; no authentication or network calls.
import React, { createContext, useContext } from 'react';
import { View, Text, Pressable, StyleSheet } from './_native';
import { Heart, Shield, Star, ArrowRight, ChevronRight, Bookmark, Trash2, RefreshCw, Film, Plus, User, LogOut, Circle, Loader, CloudOff, AlertTriangle, AlertCircle, Check, Play, Upload, Clock, Edit3, Key } from 'lucide-react';
import colors from './_colors';
import { F } from './_fonts';
export { colors, F };
export const Member = createContext(false);
export const ColorScope = createContext(colors.neon);
export const useColors = () => useContext(ColorScope);
export const router = { push: (_: string) => {}, replace: (_: string) => {} };
export const useSafeAreaInsets = () => ({top:0});
export const useDance=()=>({ favorites:[] as string[], drafts:[] as any[], removeDraft:(_:string)=>{},ready:true });
export const useDanceAuth=()=>({isLoaded:true,isSignedIn:useContext(Member),userId:'preview',email:'dancer@example.test',signOut:async()=>{},source:'clerk',logtoEnabled:false,signInWithLogto:async()=>{}});
export const useGetAccountSubscription=(_:any)=>({data:{accountId:'preview',status:'none',plan:'none' as const,subscriptionUntil:null},isError:false,isFetching:false,refetch:async()=>{}});
export const useFocusEffect=(_:any)=>{};
export const resolveDraftTemplate=(_:any):any=>null;
export const useCatalogueTemplate=(_:string):any=>({template:null});
export const Image=(_:any)=>null;
export const DraftImage=Image;
export const TemplateCard=Image;
export const StageBackdrop=()=> <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:colors.neon.background}]} />;
const icons:any={'heart':Heart,'shield':Shield,'star':Star,'arrow-right':ArrowRight,'chevron-right':ChevronRight,'bookmark':Bookmark,'trash-2':Trash2,'refresh-cw':RefreshCw,'film':Film,'plus':Plus,'user':User,'log-out':LogOut,'circle':Circle,'loader':Loader,'cloud-off':CloudOff,'alert-triangle':AlertTriangle,'alert-circle':AlertCircle,'check':Check,'play':Play,'upload':Upload,'clock':Clock,'edit-3':Edit3,'key':Key};
export function Feather({name,size,color}:any){ const Icon=icons[name]||Star; return <Icon size={size} color={color} />; }
export namespace Feather { export const glyphMap:Record<string,any>={}; }
type ColorKey=keyof typeof colors.neon;
export const tone=(c:any,key:any)=>c[key]||key;
const onTone=(c:any,key:any)=>['primary','violet'].includes(key)?c.primaryForeground:c.foreground;
export function Bouncy({children,scaleTo,haptic,...props}:any){return <Pressable {...props}>{children}</Pressable>;}
export function Pill({label,active,onPress}:any){const c=useColors();return <Bouncy onPress={onPress} style={[s.pill,{backgroundColor:active?c.primary:c.card,borderColor:c.border}]}><Text style={[s.pillText,{color:active?c.primaryForeground:c.foreground}]}>{label}</Text></Bouncy>;}
export function EmptyState({ icon, title, text, action, onAction }: { icon: keyof typeof Feather.glyphMap; title: string; text: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={[s.empty, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={[s.emptyIcon, { backgroundColor: c.secondary, borderColor: 'transparent' }]}>
        <Feather name={icon} size={26} color={c.foreground} />
      </View>
      <Text style={[s.emptyTitle, { color: c.foreground }]}>{title}</Text>
      <Text style={[s.emptyText, { color: c.mutedForeground }]}>{text}</Text>
      {action && <BigButton label={action} onPress={onAction} icon="arrow-right" small />}
    </View>
  );
}

export function BigButton({ label, onPress, icon, color = 'primary', disabled, small, testID }: {
  label: string; onPress?: () => void; icon?: keyof typeof Feather.glyphMap; color?: ColorKey; disabled?: boolean; small?: boolean; testID?: string;
}) {
  const c = useColors();
  const bg = tone(c, color);
  const fg = onTone(c, color);
  return (
    <Bouncy testID={testID} disabled={disabled} haptic="medium" onPress={onPress}
      style={[s.big, small && s.bigSmall, { backgroundColor: bg, borderColor: c.glassEdge, shadowColor: bg }]}>
      <Text style={[s.bigText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
      {icon && <Feather name={icon} size={small ? 16 : 20} color={fg} />}
    </Bouncy>
  );
}


const s = StyleSheet.create({
  pill: { paddingHorizontal: 18, paddingVertical: 11, minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 0 },
  pillText: { fontFamily: F.bodyHeavy, fontSize: 14 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  demoText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  fav: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  card: { borderRadius: 8, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  cardBottom: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 4 },
  newChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 2 },
  newText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  cardTitle: { fontFamily: F.display, fontSize: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meta: { fontFamily: F.bodyBold, fontSize: 13, opacity: 0.9 },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 14 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 12, marginBottom: 2 },
  section: { fontFamily: F.display, fontSize: 22 },
  empty: { margin: 20, padding: 26, borderRadius: 26, borderWidth: 1, alignItems: 'center', gap: 10, borderStyle: 'solid' },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, transform: [{ rotate: '-8deg' }] },
  emptyTitle: { fontFamily: F.displayBold, fontSize: 17, textAlign: 'center' },
  emptyText: { fontFamily: F.body, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  big: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 3 },
  bigSmall: { paddingVertical: 11, paddingHorizontal: 18 },
  bigText: { fontFamily: F.display, fontSize: 16 },
});
