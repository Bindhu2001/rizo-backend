import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { IMAGE_ROOT, REVAMP_API_URL } from '../constants/Config';

// A team member's photo, or a coloured circle with their initials when there is none (or it fails to load).

const REVAMP_ORIGIN = REVAMP_API_URL.replace(/\/api\/mobile\/?$/, '');
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#0D9488', '#4F46E5'];

// rizo-revamp photos are site paths (/uploads/...), legacy ones a file name on the PHP server
export const teamPhotoUri = (pic) => {
  const s = String(pic || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith('/') ? `${REVAMP_ORIGIN}${s}` : `${IMAGE_ROOT}/${s}`;
};
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const TeamAvatar = ({ person, size, ring }) => {
  const [failed, setFailed] = useState(false);
  const uri = !failed && teamPhotoUri(person.profilePic);
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring };
  if (uri) return <Image source={{ uri }} style={box} onError={() => setFailed(true)} />;
  const bg = AVATAR_COLORS[Number(person.empPkey || 0) % AVATAR_COLORS.length];
  return (
    <View style={[box, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#FFF', fontWeight: '800', fontSize: size * 0.36 }}>{initials(person.name)}</Text>
    </View>
  );
};

export default TeamAvatar;
