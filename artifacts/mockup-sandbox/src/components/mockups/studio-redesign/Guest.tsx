import React from 'react';
import { UpdatedStudio } from './_updated';
import { Member } from './_stubs';
export function Guest(){return <Member.Provider value={false}><div style={{height:'100vh',display:'flex',flexDirection:'column'}}><UpdatedStudio /></div></Member.Provider>;}
