import React from 'react';
import { UpdatedStudio } from './_updated';
import { Member as MemberContext } from './_stubs';
export function Member(){return <MemberContext.Provider value={true}><div style={{height:'100vh',display:'flex',flexDirection:'column'}}><UpdatedStudio /></div></MemberContext.Provider>;}
