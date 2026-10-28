import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS, moderateScale, hp } from './Theme';
import { useTheme } from './ThemeContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, addMonths } from 'date-fns';
import { ChevronRight, ChevronLeft, CalendarX2, List } from 'lucide-react-native';
import { fetchMonthEvents, eventsOnDay, eventMeta, normStatus } from '../services/UpcomingEvents';

const CalendarWidget = ({ userId }) => {
  const theme = useTheme();
  const navigation = useNavigation();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEvents(currentDate);
  }, [userId, currentDate]);

  const fetchEvents = async (date) => {
    setEvents([]);
    setLoading(true);
    try {
      setEvents(await fetchMonthEvents(userId, date));
    } catch (e) {
      console.log('[Calendar] fetch error', e);
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

  const getCellEvents = (day) => eventsOnDay(events, day);

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
          const hasBir = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'BIR');
          const hasJoin = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'JOIN');
          const hasHol = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'HO');
          const hasWO = dayEvents.some(e => normStatus(e.status || e.type || e.event_type) === 'WO');
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedEvent && isSameDay(day, selectedEvent.date);

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.cell, 
                isToday && { backgroundColor: theme.isDark ? '#3B1E5C' : '#F3E5F5', borderRadius: 12 },
                isSelected && { borderWidth: 2, borderColor: COLORS.primaryDeep, borderRadius: 12 }
              ]}
              onPress={() => {
                setSelectedEvent({ date: day, events: dayEvents });
              }}
            >
              <Text style={[styles.dayText, { color: theme.text }, isToday && styles.todayText]}>
                {format(day, 'd')}
              </Text>
              
              <View style={styles.indicators}>
                {hasBir && <View style={[styles.dot, { backgroundColor: '#E91E63' }]} />}
                {hasJoin && <View style={[styles.dot, { backgroundColor: '#2196F3' }]} />}
                {hasHol && <View style={[styles.dot, { backgroundColor: '#FF9800' }]} />}
                {hasWO && <View style={[styles.dot, { backgroundColor: '#4CAF50' }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.legend, { borderTopColor: theme.divider }]}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#E91E63' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Birthday</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Anniv.</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Holiday</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} /><Text style={[styles.legendText, { color: theme.textLight }]}>Week Off</Text></View>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('EventsList', { userId, month: format(currentDate, 'yyyy-MM') })}
        style={styles.fullListLink}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <List color={theme.primaryDeep} size={15} />
        <Text style={[styles.fullListText, { color: theme.primaryDeep }]}>View full month list</Text>
        <ChevronRight color={theme.primaryDeep} size={15} />
      </TouchableOpacity>

      <Modal visible={!!selectedEvent} transparent animationType="fade" onRequestClose={() => setSelectedEvent(null)} statusBarTranslucent>
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalDate, { color: theme.text }]}>
              {selectedEvent ? format(selectedEvent.date, 'dd MMM yyyy') : ''}
            </Text>
            
            {selectedEvent?.events?.length > 0 ? (
              <ScrollView style={[styles.eventList, { backgroundColor: theme.cardSoft }]} showsVerticalScrollIndicator={true} indicatorStyle="black">
                {selectedEvent.events.map((e, idx) => {
                  const meta = eventMeta(e);
                  return (
                    <View key={idx} style={[styles.eventRow, { backgroundColor: theme.cardSoft }]}>
                      <View style={[styles.eventDot, { backgroundColor: meta.color }]} />
                      <View style={{ flex: 1 }}>
                         <Text style={[styles.eventName, { color: theme.text }]} numberOfLines={2}>{meta.name}</Text>
                         <Text style={[styles.eventType, { color: theme.textLight }]}>{meta.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={[styles.emptyBox, { backgroundColor: theme.cardSoft }]}>
                <CalendarX2 color={theme.textMuted} size={34} />
                <Text style={[styles.emptyText, { color: theme.text }]}>No event on this date</Text>
              </View>
            )}

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
  headerRow: { flexDirection: 'row', marginBottom: 8 },
  weekDayText: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '700', width: '14.28%', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', height: 48, justifyContent: 'center', alignItems: 'center' },
  todayCell: { backgroundColor: '#F3E5F5', borderRadius: 12 },
  dayText: { fontSize: moderateScale(15), fontWeight: '600', color: COLORS.text },
  todayText: { color: COLORS.primaryDeep, fontWeight: '900' },
  indicators: { flexDirection: 'row', marginTop: 4, height: 5, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginHorizontal: 1 },
  legend: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 24 },
  modalDate: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, marginBottom: 16, textAlign: 'center' },
  eventList: { marginBottom: 24, maxHeight: Math.min(300, hp(35)), minHeight: 60, backgroundColor: '#F9FAFB', borderRadius: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 },
  eventDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  eventName: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text },
  eventType: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, borderRadius: 12, marginBottom: 24 },
  emptyText: { fontSize: moderateScale(15), fontWeight: '800', marginTop: 10 },
  fullListLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, gap: 6 },
  fullListText: { fontSize: moderateScale(13), fontWeight: '800' },
  closeBtn: { backgroundColor: '#E5E7EB', padding: 14, borderRadius: 16, alignItems: 'center' },
  closeBtnText: { color: COLORS.text, fontWeight: '800', fontSize: moderateScale(14) }
});

export default CalendarWidget;
