import React from 'react';
import { OriginalStudio } from './_original';
import { Member } from './_stubs';
export function CurrentMember(){return <Member.Provider value={true}><div style={{height:'100vh',display:'flex',flexDirection:'column'}}><OriginalStudio /></div></Member.Provider>;}
