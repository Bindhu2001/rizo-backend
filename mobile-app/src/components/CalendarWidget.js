import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { COLORS, SHADOWS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths } from 'date-fns';
import axios from 'axios';
import { ChevronRight, ChevronLeft } from 'lucide-react-native';
import { API_ENDPOINTS } from '../constants/Config';

const CalendarWidget = ({ userId }) => {
  const theme = useTheme();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEvents(currentDate);
  }, [userId, currentDate]);

  const fetchEvents = async (date) => {
    setLoading(true);
    try {
      const monthStr = format(date, 'yyyy-MM'); // "2026-04"
      const url = `${API_ENDPOINTS.UPCOMING_EVENTS}?user_id=${userId}&month=${monthStr}`;
      const resp = await axios.get(url);
      
      console.log('[Calendar] Fetching for month:', monthStr);
      
      if (resp.status === 200) {
        if (Array.isArray(resp.data)) {
          setEvents(resp.data);
        } else if (resp.data?.data && Array.isArray(resp.data.data)) {
          setEvents(resp.data.data);
        }
      }
    } catch (e) {
      console.log('Events fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => addMonths(prev, -1));
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    const startDayOfWeek = getDay(start); // 0 = Sunday

    const prefixDays = Array(startDayOfWeek).fill(null);
    return [...prefixDays, ...days];
  };

  const days = getDaysInMonth();
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const getCellEvents = (day) => {
    if (!day) return [];
    const dayNumber = parseInt(format(day, 'd'), 10);
    const dayMonthName = format(day, 'MMMM');
    const dayMonthShort = format(day, 'MMM');
    const monthNum = parseInt(format(day, 'M'), 10);

    try {
      return events.filter(e => {
        if (!e || !e.date) return false;

        const dm = String(e.date).trim();

        if (dm.includes('-')) {
          const parts = dm.split('-');
          if (parts.length === 2) {
            const p0 = parts[0].trim();
            const p1 = parts[1].trim();
            // "Month-Day" e.g. "May-15"
            if (isNaN(parseInt(p0, 10))) {
              return (p0 === dayMonthName || p0 === dayMonthShort) && parseInt(p1, 10) === dayNumber;
            }
            // "Day-Month" e.g. "15-May"
            if (isNaN(parseInt(p1, 10))) {
              return (p1 === dayMonthName || p1 === dayMonthShort) && parseInt(p0, 10) === dayNumber;
            }
            // "MM-DD" e.g. "05-15"
            return parseInt(p0, 10) === monthNum && parseInt(p1, 10) === dayNumber;
          } else if (parts.length === 3) {
            try { return isSameDay(new Date(dm), day); } catch (_) { return false; }
          }
        }

        if (dm.includes('/')) {
          const parts = dm.split('/');
          if (parts.length === 3) {
            // YYYY/MM/DD or DD/MM/YYYY
            const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10), c = parseInt(parts[2], 10);
            if (a > 31) return b === monthNum && c === dayNumber; // YYYY/MM/DD
            return c > 31 ? a === dayNumber && b === monthNum : false; // DD/MM/YYYY
          }
        }

        return parseInt(dm, 10) === dayNumber;
      });
    } catch (err) {
      console.error('[Calendar] Filter error', err);
      return [];
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={handlePrevMonth} style={[styles.prevBtn, { backgroundColor: theme.cardSoft }]}>
          <ChevronLeft color={COLORS.primaryDeep} size={20} />
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: theme.text }]}>{format(currentDate, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={[styles.nextBtn, { backgroundColor: theme.cardSoft }]}>
          <ChevronRight color={COLORS.primaryDeep} size={20} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.headerRow}>
        {weekDays.map((d, i) => (
          <Text key={i} style={[styles.weekDayText, { color: theme.textLight }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day, idx) => {
          if (!day) return <View key={idx} style={styles.cell} />;
          
          const dayEvents = getCellEvents(day);
          const hasBir = dayEvents.some(e => e.status === 'BIR');
          const hasJoin = dayEvents.some(e => e.status === 'JOIN');
          const hasHol = dayEvents.some(e => e.status === 'HO');
          const isToday = isSameDay(day, new Date());

          return (
            <TouchableOpacity
              key={idx}
              style={[styles.cell, isToday && [styles.todayCell, { backgroundColor: theme.isDark ? '#3B1E5C' : '#F3E5F5' }]]}
              onPress={() => {
                if (dayEvents.length > 0) {
                  setSelectedEvent({ date: day, events: dayEvents });
                }
              }}
              disabled={dayEvents.length === 0}
            >
              <Text style={[styles.dayText, { color: theme.text }, isToday && styles.todayText]}>
                {format(day, 'd')}
              </Text>
              
              <View style={styles.indicators}>
                {hasBir && <View style={[styles.underline, { backgroundColor: '#FF4081' }]} />}
                {hasJoin && <View style={[styles.underline, { backgroundColor: '#2196F3' }]} />}
                {hasHol && <View style={[styles.underline, { backgroundColor: '#FF9800' }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.legend, { borderTopColor: theme.divider }]}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#E91E63' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Birthday</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Anniv.</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Holiday</Text></View>
      </View>

      <Modal visible={!!selectedEvent} transparent animationType="fade" statusBarTranslucent>
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalDate, { color: theme.text }]}>
              {selectedEvent ? format(selectedEvent.date, 'dd MMM yyyy') : ''}
            </Text>
            
            <ScrollView style={[styles.eventList, { backgroundColor: theme.cardSoft }]} showsVerticalScrollIndicator={true} indicatorStyle="black">
              {selectedEvent?.events.map((e, idx) => {
                const isBir = e.status === 'BIR';
                const isHol = e.status === 'HO';
                const dotColor = isBir ? '#E91E63' : isHol ? '#FF9800' : '#2196F3';
                const typeText = isBir ? 'Birthday' : isHol ? 'Holiday' : 'Work Anniversary';
                
                return (
                  <View key={idx} style={[styles.eventRow, { backgroundColor: theme.cardSoft }]}>
                    <View style={[styles.eventDot, { backgroundColor: dotColor }]} />
                    <View style={{ flex: 1 }}>
                       <Text style={[styles.eventName, { color: theme.text }]} numberOfLines={2}>{e.name || 'Unknown'}</Text>
                       <Text style={[styles.eventType, { color: theme.textLight }]}>{typeText}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.border }]} onPress={() => setSelectedEvent(null)}>
              <Text style={[styles.closeBtnText, { color: theme.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 16, ...SHADOWS.light },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative', width: '100%' },
  monthTitle: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  prevBtn: { position: 'absolute', left: 0, padding: 8, backgroundColor: '#F9FAFB', borderRadius: 12, zIndex: 10 },
  nextBtn: { position: 'absolute', right: 0, padding: 8, backgroundColor: '#F9FAFB', borderRadius: 12, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  weekDayText: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '700', width: 40, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', height: 48, justifyContent: 'center', alignItems: 'center' },
  todayCell: { backgroundColor: '#F3E5F5', borderRadius: 12 },
  dayText: { fontSize: moderateScale(15), fontWeight: '600', color: COLORS.text },
  todayText: { color: COLORS.primaryDeep, fontWeight: '900' },
  indicators: { flexDirection: 'row', marginTop: 2, height: 3 },
  underline: { width: 12, height: 2, borderRadius: 1, marginHorizontal: 1 },
  legend: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 24 },
  modalDate: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, marginBottom: 16, textAlign: 'center' },
  eventList: { marginBottom: 24, maxHeight: 300, minHeight: 60, backgroundColor: '#F9FAFB', borderRadius: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 },
  eventDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  eventName: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text },
  eventType: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  closeBtn: { backgroundColor: '#E5E7EB', padding: 14, borderRadius: 16, alignItems: 'center' },
  closeBtnText: { color: COLORS.text, fontWeight: '800', fontSize: moderateScale(14) }
});

export default CalendarWidget;
