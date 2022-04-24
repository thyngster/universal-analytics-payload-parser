export default (config,raw_payload)=>{
    // Guard
    if (!config && !raw_payload)
        return;
    Object.assign(config.mapping.events,{
        'add': 'add_to_cart', 
        'remove': 'remove_from_cart',
        'refund': 'refund',
        'purchase': 'purchase',
        'click': 'select_item',
        'promoa': 'select_promotion',
        'detail': 'view_item',
    });
    
    // Parse the payload to an object
    const payload = Object.fromEntries(new URLSearchParams(raw_payload));

    const eventModel = {
        event: undefined,
        eventData: {}
    };
    
    const parseEcommerce = ()=>{
        // There no way to map this automatically just send an event with the info
        if(payload.pa === 'checkout_option'){
            pushData({
                event: 'checkout_option',
                eventData: {
                    step: payload.cos || undefined,
                    checkout_option_value: payload.col || undefined,
                }
            });
            return;
        }
        // Add Internal Items keys to mappings
        Object.assign(config.mapping.keys, {
            id: 'item_id',
            nm: 'item_name',
            pr: 'price',
            qt: 'item_quantity',
            br: 'item_brand',
            va: 'item_variant',
            pal: 'item_list_name',
            ps: 'index',
            cr: 'creative'
        });

        const eecModel = {
            event: config.mapping.events[payload.pa] || payload.pa,
            items: {},
            impressions: {},
            promotions: {}
        };
        // Workaround for view_cart, begin_checkout
        if(payload.pa === 'checkout' && config.mapping.events.checkout[payload.cos]){
            eecModel.event = config.mapping.events.checkout[payload.cos];
        }

        if(payload.pa === 'purchase'){            
            eecModel.transactionDetails = {
                id: payload.ti,
                value: payload.tr,
                tax: payload.tt,
                shipping: payload.ts,
                affiliation: payload.ta,
                coupon: payload.tcc            
            };        
        }
    
        Object.keys(payload).forEach(k=>{
            const value = payload[k];
            // Ecommerce Action, expecting products block        
            if (payload.pa && payload.pa!=='checkout_option') {                
                const matchItem = k.match(/pr([0-9])(.+)/);
                if (matchItem) {
                    const [,itemIndex] = matchItem;
                    const key = config.mapping.keys[matchItem[2]] || matchItem[2];
                    if (!eecModel.items[itemIndex])
                        eecModel.items[itemIndex] = {};
                    // We need to split the category                     
                    if (key === 'ca') {
                        value.split('/').forEach(function(category, i) {
                            const dim = i ? i + 1 : '';
                            eecModel.items[itemIndex]['item_category' + dim] = category;
                        });
                    } else {
                        if (key.match(/^cd/)) {
                            eecModel.items[itemIndex][config.mapping.keys[k] || 'dimension_' + key.slice(2)] = value;
                        } else if (key.match(/^cm/)) {
                            eecModel.items[itemIndex][config.mapping.keys[k] || 'metric_' + key.slice(2)] = value;
                        } else {
                            eecModel.items[itemIndex][key] = value;
                        }
                    }
                }
            }

            const matchImpression = k.match(/^il([0-9]+)pi([0-9]+)(.+)$/);
            if (matchImpression) {
                const [,listIndex,itemIndex,itemKey] = matchImpression;
                const key = config.mapping.keys[itemKey] || itemKey;
                const listName = payload['il' + listIndex + 'nm'] || '(not-set)';
                if (!eecModel.impressions[itemIndex])
                    eecModel.impressions[itemIndex] = {};
                // Map impression List Name
                eecModel.impressions[itemIndex]['item_list_name'] = listName;
                // We need to split the category                     
                if (itemKey === 'ca') {
                    value.split('/').forEach(function(category, i) {
                        const dim = i ? i + 1 : '';
                        eecModel.impressions[itemIndex]['item_category' + dim] = category;
                    });
                } else {
                    eecModel.impressions[itemIndex][key] = value;
                }
            }

            const matchPromo = k.match(/^promo([0-9]+)(.*)/);
            if (matchPromo) {
                const promoMap = {
                    id: 'promotion_id',
                    nm: 'promotion_name',
                    cr: 'creative_name',                    
                    ps: 'creative_slot'                                    
                };
                const [,promoIndex,promoKey] = matchPromo;
                if(!eecModel.promotions[promoIndex]) eecModel.promotions[promoIndex] = {};
                eecModel.promotions[promoIndex][promoMap[promoKey]] = value;     
            }
        }
        );
 
        if (eecModel.event) {
            const ee =  {
                event: eecModel.event,
                items: Object.values(eecModel.items)
            };
            if(eecModel.event === 'purchase'){            
                Object.assign(ee,eecModel.transactionDetails);
            }
            pushData(ee);

        }
        if (Object.keys(eecModel.impressions).length > 0) {
            pushData({
                event: 'view_item_list',
                items: Object.values(eecModel.impressions)
            });
        }
        if (Object.keys(eecModel.promotions).length > 0) {
            pushData({
                event: 'view_promotion',
                items: Object.values(eecModel.promotions)
            });
        }
    };
    const dataMapping = ()=>{
        // Extract Meta Data
        Object.keys(payload).forEach(function(k) {
            if (k.match(/^cd/)) {
                eventModel.eventData[config.mapping.keys[k] || 'dimension_' + k.slice(2)] = payload[k];
            }
            if (k.match(/^cm/)) {
                eventModel.eventData[config.mapping.keys[k] || 'metric_' + k.slice(2)] = payload[k];
            }
            if (k.match(/^cg/)) {
                eventModel.eventData[config.mapping.keys[k] || 'content_group_' + k.slice(2)] = payload[k];
            }
        });
    };

    // Refactor: Use Object Literals rather than switch    
    const Fn = (lookupObject,defaultCase='_default')=>expression=>(lookupObject[expression] || lookupObject[defaultCase])();

    const pushData = (data)=>{
        const obj = data || eventModel;
        if (config.tms === 'gtm') {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(obj);
        } else if (config.tms === 'tealiumiq' && window.utag.link) {
            window.utag.link(obj);
        } else if (config.tms === 'launch' && window._satallite && window._satallite.track) {
            window._satellite.track(obj.event, obj.eventData);
        } else {
            if(window.console && window.console.log){
                console.log(obj);
            }            
        }
    };
    // Parsing functions
    const fns = {
        pageview: ()=>{
            eventModel.event = 'page_view';
            dataMapping();
            Object.assign(eventModel.eventData, {
                page_title: payload.dt,
                page_location: payload.dl,
                page_path: payload.dp
            });
        }
        ,
        event: ()=>{
            eventModel.event = config.eventsName || 'gaEvent',
            dataMapping();
            Object.assign(eventModel.eventData, {
                category: payload.ec || undefined,
                action: payload.ea || undefined,
                label: payload.el || undefined,
                value: payload.ev || undefined,
                nonInt: payload.ni ? false : true,
            });
        }
        ,
        exception: ()=>{
            eventModel.event = 'exception',
            dataMapping();
            Object.assign(eventModel.eventData, {
                exception_description: payload.exd || undefined,
                exception_is_fatal: payload.exf || undefined
            });
        }
        ,
        social: ()=>{
            eventModel.event = 'social';
            dataMapping();
            Object.assign(eventModel.eventData, {
                social_action: payload.sa || undefined,
                social_network: payload.sn || undefined,
                social_target: payload.st || undefined,
            });
        }
        ,
        timing: ()=>{
            eventModel.event = 'timing';
            dataMapping();
            Object.assign(eventModel.eventData, {
                timing_category: payload.utc || undefined,
                timing_value: payload.utv || undefined,
                timing_time: payload.utt || undefined,
                timing_label: payload.utl || undefined,
            });
        }
        ,
        transaction: ()=>{
            eventModel.event = 'transaction',
            dataMapping();
            Object.assign(eventModel.eventData, {
                transaction_id: payload.ti || undefined,
                transaction_affiliation: payload.ta || undefined,
                transaction_revenue: payload.tr || undefined,
                transaction_shipping: payload.ts || undefined,
                transaction_tax: payload.tt || undefined,
                currency: payload.cu || undefined,
            });
        }
        ,
        item: ()=>{
            eventModel.event = 'item',
            dataMapping();
            Object.assign(eventModel.eventData, {
                transaction_id: payload.ti || undefined,
                item_id: payload.ic || undefined,
                item_name: payload.in || undefined,
                item_price: payload.ip || undefined,
                item_quantity: payload.iq || undefined,
                item_variation: payload.iv || undefined,
                currency: payload.cu || undefined,
            });
        }
        ,
        default: ()=>{
            console.log('not supported hit type: ', payload);
        }
    };

    const eventTypes = {
        'pageview': fns.pageview,
        'event': fns.event,
        'timing': fns.timing,
        'social': fns.social,
        'exception': fns.exception,
        'transaction': fns.transaction,
        'item': fns.item,
        'default': fns.default
    };

    const eventParser = Fn(eventTypes, 'default');

    // Main
    // Parse UA Payload
    eventParser(payload.t);
    
        
    const hasEcommerce = Object.keys(payload).filter(function(k) {
        return k.match(/pa|promo[a,0-9]|il[0-9]/);
    }).length === 0 ? false : true;
    
    if(!(hasEcommerce && config.skipTransportEvent)) pushData();
    
    if (hasEcommerce && config.ecommerceEventsEnabled) {
        parseEcommerce();
    }
};

