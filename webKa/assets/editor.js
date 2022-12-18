//const { each } = require("jquery");

var editPlaylistModal = document.getElementById('editPlaylistModal')
//var simpleContTable = editModal.querySelector('.simpleContTable')
var tableSC = document.getElementById('simpleContTable').getElementsByTagName('tbody')[0];
var tableIC = document.getElementById('interactiveContTable').getElementsByTagName('tbody')[0];

var current_playlist_path = ''
var current_track_index = ''

var edit_track_mode
var current_playlist
var content_table





//------------------------PLAYLIST MODAL-------------------------
function newPlaylist(){
    let playlist = {
        playlist_name: $('#newPlaylist_name_input').val(),
        version: "1.0",
        next_topic:"",
        prev_topic:"",
        play_pause_topic:"",
        stop_topic:"",
        state_topic:"",
        volume_val_topic:"",
        volume_up_topic:"",
        volume_down_topic:"",
        tracks:[]
    }
    current_playlist_path='data/playlists/'+playlist.playlist_name+'.json'
    fetch_post_playlist(current_playlist_path, playlist).then(()=>{
        window.location.reload();
    })
}

function edit_playlist_modal(path) {
    current_playlist_path = path
    fetch_get_playlist().then(()=>{
        $('#editPlaylistModal').modal('show')
    })
}

function insertAddTrackButtons(){
    var newRow = tableSC.insertRow(-1)
    newRow.insertCell()
    newRow.insertCell()
    newRow.insertCell()
    var addCell = newRow.insertCell().innerHTML = `<button class="mx-1 btn btn-outline-secondary btn-sm" type="button" onclick = "open_edit_track_modal('')">add</button>`

    newRow = tableIC.insertRow(tableIC.rows.length)
    newRow.insertCell()
    newRow.insertCell()
    newRow.insertCell()
    addCell = newRow.insertCell().innerHTML = `<button class="mx-1 btn btn-outline-secondary btn-sm" type="button" onclick = "open_edit_track_modal('')">add</button>`
}

function update_playlist_modal(){   
    tableSC.innerHTML = ""
    tableIC.innerHTML = ""

    $('#playlist_name_input').val(current_playlist.playlist_name)
    for (let index in current_playlist.tracks) {
        let track = current_playlist.tracks[index]
        //console.log("Find track: ", track)
        if (track.type == 'simple') {
            var newRow = tableSC.insertRow(tableSC.rows.length)
            var order_cell = newRow.insertCell().innerHTML = track.order_num
            var name_cell = newRow.insertCell().innerHTML = track.name
            var path_cell = newRow.insertCell().innerHTML = track.path
            const controls = newRow.insertCell().innerHTML = `
                    <button class="mx-1 btn btn-outline-secondary btn-sm" type="button" onclick = "open_edit_track_modal('${index}', 'edit')">edit</button>
                    <button class="mx-1 btn btn-outline-secondary btn-sm" type="button" onclick = "show_delete_track_modal(${index})">delete</button>
                    `
        } else if (track.type == 'interactive') {
            var newRow = tableIC.insertRow(tableIC.rows.length)
            var id_cell = newRow.insertCell().innerHTML = track.order_num
            var name_cell = newRow.insertCell().innerHTML = track.name
            var path_cell = newRow.insertCell().innerHTML = track.path
            const controls = newRow.insertCell().innerHTML = `
                    <button class="mx-1 btn btn-outline-secondary btn-sm" type="button" onclick = "open_edit_track_modal('${index}', 'edit')">edit</button>
                    <button class="mx-1 btn btn-outline-secondary btn-sm" type="button" onclick = "show_delete_track_modal(${index})">delete</button>
                    `
        }
    }
    insertAddTrackButtons()
        
}

function save_edit_playlist(){
    $('#editPlaylistModal').modal('hide')
    fetch_post_playlist(current_playlist_path, current_playlist)
}

function cancel_edit_playlist(){
    
    tableSC.innerHTML = ""
    tableIC.innerHTML = ""
    $('#editPlaylistModal').modal('hide')
}

$('#playlist_name_input').on("change", function(){
    console.log("playlist name is changed")
    current_playlist.playlist_name = $('#playlist_name_input').val()
})

$('#editPlaylistModal').on('shown.bs.modal', function(){
    update_playlist_modal()
})

//----------------------Delete playlist----------------------------
var confirm_delete = document.getElementById('verify_delete')
var delete_index = 0
confirm_delete.addEventListener('show.bs.modal', function (event) {
    var delete_button = event.relatedTarget

    var modal_header_task_name = confirm_delete.querySelector('.name_to_delete')

    modal_header_task_name.innerHTML = delete_button.getAttribute('d-name')
    delete_index = delete_button.getAttribute('d-index')
})

async function delete_playlist(index){
    var modal_header_task_name = confirm_delete.querySelector('.name_to_delete')
    //var delete_button = event.relatedTarget
    var data = {
        index_to_delete : delete_index,
        name_to_delete: modal_header_task_name.innerHTML
    }
    console.log('Playlist name to delete: ' + data.index_to_delete)
    fetch('/delete_playlist', {
        method: 'POST',
        headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: JSON.stringify(data)
    }).then((res) => {
        console.log("delete POST OK:", res)
        window.location.reload();
        }).catch((err) => {
        console.log(err)
        })
}

async function fetch_post_playlist(path, playlist) {
    outData = {
        path: path,
        playlist: playlist
    }
    return fetch('/save_playlist', {
        method: 'POST',
        headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: JSON.stringify(outData)
    }).then((res) => {
        console.log("Playlist POST OK, res: ", res)
        window.location.reload();
        }).catch((err) => {
        console.log(err)
    })
}
//------------------------TRACK MODAL-------------------------

function open_edit_track_modal(index) {
    if(index != ''){
        current_track_index = index
        console.log("Edit track index: " + current_track_index)
    }else{
        current_track_index=current_playlist.tracks.length
    }
    $('#editPlaylistModal').modal('hide')
    $('#editTrackModal').modal('show')
}

function saveTrack() {
    let type
    
    let track={
        order_num : parseInt($('#order_input').val()),
        name : $('#track_name_input').val(),
        path : $('#path_input').val(),
        content_group : $("#type_select option:selected").text(),
        type : '',
        error: "",
        loop : $('#loop_Enable').prop('checked'),
        triger_on : $('#turnOn_Topic').val() + " : " + $('#turnOn_Payload').val(),
        triger_off : $('#turnOff_Topic').val() + " : " + $('#turnOff_Payload').val(),
        pub_on_start : $('#startAction_Topic').val() + " : " + $('#startAction_Payload').val(),
        pub_on_end : $('#endAction_Topic').val() + " : " + $('#endAction_Payload').val()
    }

    if((track.triger_on.length>3) ||
        (track.triger_off.length>3) ||
        (track.pub_on_start.length>3) ||
        (track.pub_on_end.length>3)){
        track.type = 'interactive'  
    }else{
        track.type = 'simple'
    }

    current_playlist.tracks.forEach(item => {
        if(item.order_num== track.order_num){
            item.order_num = parseInt(current_track_index)+1
        }
    });

    if(current_track_index>=current_playlist.tracks.length){
        current_playlist.tracks.push(track) 
    }else{
        current_playlist.tracks[current_track_index]=track
    }

    current_playlist.tracks.sort(function(a,b){
        return a.order_num - b.order_num
    })
    //-----------------simple - interactive sorting
    current_playlist.tracks.sort(function(a,b){
        if(a.type=='simple' && b.type=='interactive'){
            let tmp = b.order_num
            b.order_num=a.order_num
            a.order_num=tmp
            return -1
        }else{
            return 0
        }
    })

    $('#editTrackModal').modal('hide')
    $('#editPlaylistModal').modal('show')
    
}

function cancelEditTrack(){
    $('#editTrackModal').modal('hide')
    $('#editPlaylistModal').modal('show')
    
}

//------------------------TRACK MODAL-----------------EVRNTS-------------

editTrackModal.addEventListener('show.bs.modal', function (event) {
    var track_name = document.getElementById('track_name_input')
    $('#turnOn_Topic').val('')
    $('#turnOn_Payload').val('')
    $('#turnOn_row').addClass("css_inactive")
    $('#turnOff_Topic').val('')
    $('#turnOff_Payload').val('')
    $('#turnOff_row').addClass("css_inactive")
    $('#startAction_Topic').val('')
    $('#startAction_Payload').val('')
    $('#startAction_row').addClass("css_inactive")
    $('#endAction_Topic').val('')
    $('#endAction_Payload').val('')
    $('#endAction_row').addClass("css_inactive")
    $('#loop_Enable').bootstrapToggle('off')

    $('#type_select').empty()
    for(let key in Object.keys(content_table)){
        $('#type_select').append(`<option value="">${Object.keys(content_table)[key]}</option>`)
    }
    $('#name_select').empty()
    

    if(current_track_index<current_playlist.tracks.length){ 
        //------------------------EDIT SIMPLE SETTINGS-------------------------
        track_name.value = current_playlist.tracks[current_track_index].name
        let track_type = current_playlist.tracks[current_track_index].content_group
        $('#order_input').val(parseInt(current_track_index)+1)
        //let indexType = content_table.findIndex(s=>s.path==current_playlist.tracks[current_track_index].path)
        $('#type_select option:contains('+track_type+')').prop('selected', true);
        
        //console.log("name select "+ $("#type_select option:selected").text())
        for (let index in content_table[track_type]){
            //console.log("nsme select "+ content_table[$("#type_select option:selected").text()][index].name )
            $('#name_select').append(`<option value="">${content_table[track_type][index].name}</option>`)
        }
        $('#path_input').val(current_playlist.tracks[current_track_index].path)
        let indexOf = content_table[track_type].findIndex(s=>s.path==current_playlist.tracks[current_track_index].path)
        let FileName = content_table[track_type][indexOf].name
        $('#name_select option:contains('+FileName+')').prop('selected', true);
        
        
        //------------------------EDIT INTERACTIVE TRACK-------------------------
        if(current_playlist.tracks[current_track_index].type=='interactive'){
            if(current_playlist.tracks[current_track_index].triger_on!=''){
                $('#turnOn_Topic').val(current_playlist.tracks[current_track_index].triger_on.split(':').slice(0,1))
                $('#turnOn_Payload').val(current_playlist.tracks[current_track_index].triger_on.split(':').slice(-1))
                $('#turnOn_row').removeClass("css_inactive")
            }
            if(current_playlist.tracks[current_track_index].triger_off!=''){
                $('#turnOff_Topic').val(current_playlist.tracks[current_track_index].triger_off.split(':').slice(0,1))
                $('#turnOff_Payload').val(current_playlist.tracks[current_track_index].triger_off.split(':').slice(-1))
                $('#turnOff_row').removeClass("css_inactive")
            }
            if(current_playlist.tracks[current_track_index].pub_on_start!=''){
                $('#startAction_Topic').val(current_playlist.tracks[current_track_index].pub_on_start.split(':').slice(0,1))
                $('#startAction_Payload').val(current_playlist.tracks[current_track_index].pub_on_start.split(':').slice(-1))
                $('#startAction_row').removeClass("css_inactive")
            }
            if(current_playlist.tracks[current_track_index].pub_on_end!=''){
                $('#endAction_Topic').val(current_playlist.tracks[current_track_index].pub_on_end.split(':').slice(0,1))
                $('#endAction_Payload').val(current_playlist.tracks[current_track_index].pub_on_end.split(':').slice(-1))
                $('#endAction_row').removeClass("css_inactive")
            }
            if(current_playlist.tracks[current_track_index].loop=='on'){
                $('#loop_Enable').bootstrapToggle('on')
                $('#loop_row').removeClass("css_inactive")
            }

        }
        

    }else{
        //------------------------NEW TRACK-------------------------
        track_name.value = 'new_track'
        $('#order_input').val(current_playlist.tracks.length+1)
        //$('#type_select option:contains("video")').prop('selected', true);

        for (let index in content_table[$("#type_select option:selected").text()]){
            //console.log("nsme select "+ content_table[$("#type_select option:selected").text()][index].name )
            $('#name_select').append(`<option value="">${content_table[$("#type_select option:selected").text()][index].name}</option>`)
        }
        $('#path_input').val(content_table[$("#type_select option:selected").text()][0].path)
        
    }

})

$('#type_select').on("change", function(){
    //console.log("edit content type: " + $('#type_select').val())
    $('#name_select').empty()
    for (let index in content_table[$("#type_select option:selected").text()]){
        //console.log("nsme select "+ content_table[$("#type_select option:selected").text()][index].name )
        $('#name_select').append(`<option value="">${content_table[$("#type_select option:selected").text()][index].name}</option>`)
    }
    //let tmpIndex = content_table.findIndex(s=>s.type==$('#type_select').val())
    $('#path_input').val(content_table[$("#type_select option:selected").text()][0].path)
})

$('#name_select').on("change", function(){
    //console.log("name select changed: "+$("#name_select option:selected").text())
    let tmpIndex = content_table[$("#type_select option:selected").text()].findIndex(s=>s.name==$("#name_select option:selected").text())
    $('#path_input').val(content_table[$("#type_select option:selected").text()][tmpIndex].path) 
})

$('#turnOn_Topic,#turnOn_Payload').on("change", function(){
    $('#turnOn_row').addClass("css_inactive")
    if($('#turnOn_Topic').val()!=''){
        if(($('#turnOn_Payload').val()!='')){
            $('#turnOn_row').removeClass("css_inactive")
        }
    }
})

$('#turnOff_Topic,#turnOff_Payload').on("change", function(){
    $('#turnOff_row').addClass("css_inactive")
    if($('#turnOff_Topic').val()!=''){
        if(($('#turnOff_Payload').val()!='')){
            $('#turnOff_row').removeClass("css_inactive")
        }
    }
})

$('#startAction_Topic,#startAction_Payload').on("change", function(){
    $('#startAction_row').addClass("css_inactive")
    if($('#startAction_Topic').val()!=''){
        if(($('#startAction_Payload').val()!='')){
            $('#startAction_row').removeClass("css_inactive")
        }
    }
})

$('#endAction_Topic,#endAction_Payload').on("change", function(){
    $('#endAction_row').addClass("css_inactive")
    if($('#endAction_Topic').val()!=''){
        if(($('#endAction_Payload').val()!='')){
            $('#endAction_row').removeClass("css_inactive")
        }
    }
})
$('#loop_Enable').on("change",function() {
    // try {
    //     current_playlist.tracks[current_track_index].loop = $(this).prop('checked')
    // }catch{

    // }
  })
//------------------------TRACK DELETE MODAL-------------------------

function show_delete_track_modal(index){
    current_track_index = index
    $('#editPlaylistModal').modal('hide')
    $('#confirmDeleteTrackModal').modal('show')
    $('#deleteTrack_name_input').val(current_playlist.tracks[current_track_index].name)
}

function delete_track(){
    console.log("lets delete track name: " + current_playlist.tracks[current_track_index].name)
    current_playlist.tracks.splice(current_track_index,1)
    fetch_post_playlist(current_playlist_path, current_playlist).then(()=>{
        //window.location.reload();
        //update_playlist_modal()
        //$('#editPlaylistModal').reload()
        $('#confirmDeleteTrackModal').modal('hide')
        $('#editPlaylistModal').modal('show')
    })
}

function cancel_delete_track(){
    $('#confirmDeleteTrackModal').modal('hide')
    $('#editPlaylistModal').modal('show')
}

async function fetch_get_playlist(){
    return fetch(`/get_playlist?${current_playlist_path}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }).then((res) => res.json()
    ).then((dat) => {
        console.log("GET play list, res: ", dat.playlist.tracks) 
        current_playlist = dat.playlist
        content_table = dat.content_table
    }).catch((err) => {
        console.log(err)
    })
}

